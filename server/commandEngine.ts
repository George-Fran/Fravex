import QRCode from 'qrcode';
import { igdl2, ttdl } from 'ruhend-scraper';
import type { BotConfig, BuiltInCommandConfig, CustomCommandConfig } from '../src/types/bot.ts';
import { parseDurationMs, reminderService } from './reminderService.ts';
import {
  createTextSticker,
  createTikTokStickerFromScreenshot,
  createWebpStickerFromImage,
} from './stickerUtils.ts';

const PERU_TIMEZONE = 'America/Lima';

export interface CommandContext {
  config: BotConfig;
  rawText: string;
  source?: 'whatsapp' | 'simulator';
  targetJid?: string;
  senderName: string;
  senderId: string;
  isGroup: boolean;
  isAdmin: boolean;
  groupName?: string;
  groupParticipants?: string[];
  groupAdminCount?: number;
  imageBuffer?: Buffer | null;
  uptimeSeconds: number;
}

export interface CommandReply {
  type: 'text' | 'sticker' | 'image' | 'video' | 'audio';
  text?: string;
  buffer?: Buffer;
  mimetype?: string;
  externalUrl?: string;
  caption?: string;
  mentions?: string[];
}

export interface ExecutionOutcome {
  matched: boolean;
  commandUsed: string | null;
  stickerGenerated: boolean;
  status: 'ok' | 'ignored' | 'error';
  detail: string;
  replies: CommandReply[];
}

const MORSE_MAP: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
  G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', 'Ñ': '--.--', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '-': '-....-',
};

const CHISTES = [
  '— Oye, ¿cuál es tu plato favorito y por qué?\n— Pues el hondo, porque cabe más comida.',
  '— ¿Por qué los programadores confunden Halloween con Navidad?\n— Porque OCT 31 es igual a DEC 25.',
  '— Mamá, en el colegio me dicen distraído.\n— Juanito, tú vives en la casa de enfrente.',
  '— ¿Qué hace una abeja en el gimnasio?\n— Zum-ba.',
  '— Doctor, tengo un problema: nadie me hace caso.\n— ¡Que pase el siguiente!',
  '— ¿Cuál es el último animal que subió al arca de Noé?\n— El del-fin.',
];

const FRASES = [
  '«La simplicidad es la máxima sofisticación.» — Leonardo da Vinci',
  '«Primero resuelve el problema. Luego escribe el código.» — John Johnson',
  '«La mejor forma de predecir el futuro es implementándolo.» — Alan Kay',
  '«Hazlo funcionar, hazlo bien, hazlo rápido.» — Kent Beck',
  '«La constancia convierte pequeñas automatizaciones en grandes resultados.»',
];

const WEATHER_CODES: Record<number, string> = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna ligera',
  53: 'Llovizna moderada',
  55: 'Llovizna intensa',
  56: 'Llovizna helada ligera',
  57: 'Llovizna helada densa',
  61: 'Lluvia ligera',
  63: 'Lluvia moderada',
  65: 'Lluvia fuerte',
  66: 'Lluvia helada ligera',
  67: 'Lluvia helada fuerte',
  71: 'Nieve ligera',
  73: 'Nieve moderada',
  75: 'Nieve intensa',
  77: 'Granizo fino',
  80: 'Chubascos ligeros',
  81: 'Chubascos moderados',
  82: 'Chubascos fuertes',
  85: 'Nevadas ligeras',
  86: 'Nevadas fuertes',
  95: 'Tormenta eléctrica',
  96: 'Tormenta con granizo ligero',
  99: 'Tormenta con granizo fuerte',
};

function validateAllowedDownloadUrl(rawUrl: string, allowedDomains: string[]): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    const ok = allowedDomains.some((d) => host === d || host.endsWith('.' + d));
    return ok ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isSafePublicMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadMediaBuffer(
  mediaUrl: string,
  maxBytes = 25 * 1024 * 1024
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isSafePublicMediaUrl(mediaUrl)) {
    throw new Error('URL de descarga no permitida.');
  }
  const res = await fetch(mediaUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`No se pudo descargar el archivo multimedia (HTTP ${res.status}).`);
  }
  const lenHeader = Number(res.headers.get('content-length') || 0);
  if (lenHeader > maxBytes) {
    throw new Error('El video supera el límite de 25 MB para enviarse por WhatsApp.');
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  if (buffer.length > maxBytes) {
    throw new Error('El video supera el límite de 25 MB para enviarse por WhatsApp.');
  }
  return {
    buffer,
    contentType: (res.headers.get('content-type') || 'application/octet-stream').toLowerCase(),
  };
}

function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/**
 * Safe recursive-descent arithmetic evaluator (+, -, *, /, %, ^, parentheses).
 * Never uses eval or dynamic code execution.
 */
function safeEvaluateMath(expr: string): number {
  const normalized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');
  const tokens = normalized.match(/(\d+(\.\d+)?|[+\-*/%^()])/g);
  if (!tokens || tokens.join('') !== normalized) {
    throw new Error('Expresión matemática inválida');
  }

  let pos = 0;

  function peek(): string | undefined {
    return tokens![pos];
  }

  function consume(): string {
    return tokens![pos++];
  }

  function parseExpression(): number {
    let val = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parsePower();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const right = parsePower();
      if ((op === '/' || op === '%') && right === 0) {
        throw new Error('División entre cero');
      }
      if (op === '*') val *= right;
      else if (op === '/') val /= right;
      else val %= right;
    }
    return val;
  }

  function parsePower(): number {
    let base = parseUnary();
    if (peek() === '^') {
      consume();
      const exp = parsePower();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = peek();
    if (token === '(') {
      consume();
      const val = parseExpression();
      if (consume() !== ')') {
        throw new Error('Paréntesis sin cerrar');
      }
      return val;
    }
    if (token && /^\d+(\.\d+)?$/.test(token)) {
      consume();
      return Number(token);
    }
    throw new Error('Token inesperado');
  }

  const result = parseExpression();
  if (pos !== tokens.length || !Number.isFinite(result)) {
    throw new Error('Operación no válida');
  }
  return result;
}

function buildMenuText(config: BotConfig): string {
  const p = config.prefix;
  const activeBuiltIns = config.builtInCommands.filter((c) => c.enabled);
  const activeCustom = config.customCommands.filter((c) => c.enabled);

  const labels: Record<string, string> = {
    stickers: 'Stickers y Multimedia',
    utilidades: 'Utilidades y Juegos',
    info: 'Información en Vivo',
    grupos: 'Administración de Grupos',
  };

  const sections: string[] = [
    `*${config.botName}*`,
    `Prefijo activo: *${p}* | Comandos activos: ${activeBuiltIns.length + activeCustom.length}`,
    '',
  ];

  (['stickers', 'utilidades', 'info', 'grupos'] as const).forEach((cat) => {
    const items = activeBuiltIns.filter((c) => c.category === cat);
    if (items.length === 0) return;
    sections.push(`*${labels[cat]}*`);
    items.forEach((c) => {
      const formattedUsage = c.usage.replace(/^\//, p);
      sections.push(`• \`${formattedUsage}\` — ${c.description}`);
    });
    sections.push('');
  });

  if (activeCustom.length > 0) {
    sections.push('*Comandos Personalizados*');
    activeCustom.forEach((c) => {
      sections.push(`• \`${p}${c.trigger}\` — ${c.description}`);
    });
    sections.push('');
  }

  sections.push(`Tip: Envía o responde a una foto con *${p}sticker* para convertirla al instante.`);
  return sections.join('\n').trim();
}

export async function executeCommand(ctx: CommandContext): Promise<ExecutionOutcome> {
  const startedAt = Date.now();
  const text = ctx.rawText.trim();
  const prefix = ctx.config.prefix;

  if (!text.startsWith(prefix)) {
    return {
      matched: false,
      commandUsed: null,
      stickerGenerated: false,
      status: 'ignored',
      detail: 'Sin prefijo',
      replies: [],
    };
  }

  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) {
    return {
      matched: false,
      commandUsed: null,
      stickerGenerated: false,
      status: 'ignored',
      detail: 'Prefijo vacío',
      replies: [],
    };
  }

  const [rawTrigger, ...argParts] = withoutPrefix.split(/\s+/);
  const trigger = rawTrigger.toLowerCase();
  const argsText = withoutPrefix.slice(rawTrigger.length).trim();

  // Check custom commands first if matching trigger
  const customCmd: CustomCommandConfig | undefined = ctx.config.customCommands.find(
    (c) => c.trigger.toLowerCase() === trigger
  );

  if (customCmd) {
    if (!customCmd.enabled) {
      return {
        matched: true,
        commandUsed: `${prefix}${customCmd.trigger}`,
        stickerGenerated: false,
        status: 'ignored',
        detail: 'Comando deshabilitado',
        replies: [{ type: 'text', text: `El comando *${prefix}${customCmd.trigger}* está desactivado.` }],
      };
    }

    if (customCmd.adminOnly && ctx.isGroup && !ctx.isAdmin) {
      return {
        matched: true,
        commandUsed: `${prefix}${customCmd.trigger}`,
        stickerGenerated: false,
        status: 'ignored',
        detail: 'Requiere administrador',
        replies: [{ type: 'text', text: 'Este comando solo puede usarlo un administrador del grupo.' }],
      };
    }

    const now = new Date();
    const rendered = customCmd.response
      .replace(/\{usuario\}/gi, ctx.senderName || 'Usuario')
      .replace(/\{bot\}/gi, ctx.config.botName)
      .replace(/\{args\}/gi, argsText)
      .replace(/\{fecha\}/gi, now.toLocaleDateString('es-PE', { timeZone: PERU_TIMEZONE }))
      .replace(
        /\{hora\}/gi,
        now.toLocaleTimeString('es-PE', {
          timeZone: PERU_TIMEZONE,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );

    return {
      matched: true,
      commandUsed: `${prefix}${customCmd.trigger}`,
      stickerGenerated: false,
      status: 'ok',
      detail: 'Comando personalizado ejecutado',
      replies: [{ type: 'text', text: rendered }],
    };
  }

  // Find built-in command by trigger or alias
  const builtIn: BuiltInCommandConfig | undefined = ctx.config.builtInCommands.find(
    (c) => c.trigger === trigger || c.aliases.includes(trigger)
  );

  if (!builtIn) {
    return {
      matched: true,
      commandUsed: `${prefix}${trigger}`,
      stickerGenerated: false,
      status: 'error',
      detail: 'Comando no encontrado',
      replies: [
        {
          type: 'text',
          text: `No reconozco el comando *${prefix}${trigger}*. Escribe *${prefix}menu* para ver la lista disponible.`,
        },
      ],
    };
  }

  if (!builtIn.enabled) {
    return {
      matched: true,
      commandUsed: `${prefix}${builtIn.trigger}`,
      stickerGenerated: false,
      status: 'ignored',
      detail: 'Comando desactivado',
      replies: [
        {
          type: 'text',
          text: `El comando *${prefix}${builtIn.trigger}* está desactivado actualmente.`,
        },
      ],
    };
  }

  if (builtIn.groupOnly && !ctx.isGroup) {
    return {
      matched: true,
      commandUsed: `${prefix}${builtIn.trigger}`,
      stickerGenerated: false,
      status: 'ignored',
      detail: 'Solo grupos',
      replies: [
        {
          type: 'text',
          text: `El comando *${prefix}${builtIn.trigger}* solo funciona dentro de grupos de WhatsApp.`,
        },
      ],
    };
  }

  if (builtIn.adminOnly && ctx.isGroup && !ctx.isAdmin) {
    return {
      matched: true,
      commandUsed: `${prefix}${builtIn.trigger}`,
      stickerGenerated: false,
      status: 'ignored',
      detail: 'Solo admins',
      replies: [
        {
          type: 'text',
          text: `Solo los administradores del grupo pueden usar *${prefix}${builtIn.trigger}*.`,
        },
      ],
    };
  }

  try {
    switch (builtIn.id) {
      case 'menu': {
        return {
          matched: true,
          commandUsed: `${prefix}menu`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Menú enviado',
          replies: [{ type: 'text', text: buildMenuText(ctx.config) }],
        };
      }

      case 'sticker': {
        if (!ctx.imageBuffer) {
          return {
            matched: true,
            commandUsed: `${prefix}sticker`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta imagen',
            replies: [
              {
                type: 'text',
                text: `Para crear un sticker, envía una imagen con la descripción *${prefix}sticker* o responde a una foto con *${prefix}sticker*.\nOpción extra: *${prefix}sticker recorte* para ajustar al cuadrado.`,
              },
            ],
          };
        }

        const crop =
          argParts.some((a) => ['recorte', 'cuadrado', 'crop'].includes(a.toLowerCase()));
        const webp = await createWebpStickerFromImage(ctx.imageBuffer, {
          crop,
          packName: ctx.config.stickerPack,
          authorName: ctx.config.stickerAuthor,
        });

        return {
          matched: true,
          commandUsed: `${prefix}sticker`,
          stickerGenerated: true,
          status: 'ok',
          detail: crop ? 'Sticker 512x512 (recorte)' : 'Sticker 512x512 (original)',
          replies: [{ type: 'sticker', buffer: webp }],
        };
      }

      case 'stickert': {
        if (!ctx.imageBuffer) {
          return {
            matched: true,
            commandUsed: `${prefix}stickert`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta captura de TikTok',
            replies: [
              {
                type: 'text',
                text: `Para usar *${prefix}stickert*, envía la captura de pantalla del sticker de TikTok (o responde a una captura) con *${prefix}stickert*.`,
              },
            ],
          };
        }

        const { buffer: webp, detectedBox } = await createTikTokStickerFromScreenshot(
          ctx.imageBuffer,
          {
            packName: ctx.config.stickerPack,
            authorName: ctx.config.stickerAuthor,
          }
        );

        return {
          matched: true,
          commandUsed: `${prefix}stickert`,
          stickerGenerated: true,
          status: 'ok',
          detail: detectedBox
            ? 'Sticker TikTok recortado (512x512)'
            : 'Sticker convertido (recorte automático)',
          replies: [{ type: 'sticker', buffer: webp }],
        };
      }

      case 'ttp': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}ttp`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta texto',
            replies: [
              {
                type: 'text',
                text: `Escribe el texto para convertir en sticker. Ejemplo: *${prefix}ttp Buenos días*`,
              },
            ],
          };
        }

        const webp = await createTextSticker(argsText, {
          packName: ctx.config.stickerPack,
          authorName: ctx.config.stickerAuthor,
        });

        return {
          matched: true,
          commandUsed: `${prefix}ttp`,
          stickerGenerated: true,
          status: 'ok',
          detail: 'Sticker de texto generado',
          replies: [{ type: 'sticker', buffer: webp }],
        };
      }

      case 'qr': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}qr`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta contenido QR',
            replies: [
              {
                type: 'text',
                text: `Indica el enlace o texto para generar el código QR. Ejemplo: *${prefix}qr https://whatsapp.com*`,
              },
            ],
          };
        }

        const pngBuffer = await QRCode.toBuffer(argsText.slice(0, 500), {
          width: 512,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
        });

        return {
          matched: true,
          commandUsed: `${prefix}qr`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Código QR generado',
          replies: [
            {
              type: 'image',
              buffer: pngBuffer,
              caption: `Código QR generado para:\n${argsText.slice(0, 120)}`,
            },
          ],
        };
      }

      case 'ping': {
        const latency = Math.max(1, Date.now() - startedAt);
        return {
          matched: true,
          commandUsed: `${prefix}ping`,
          stickerGenerated: false,
          status: 'ok',
          detail: `${latency} ms`,
          replies: [
            {
              type: 'text',
              text: `*Pong*\n• Tiempo de respuesta: ${latency} ms\n• Tiempo activo: ${formatUptime(ctx.uptimeSeconds)}`,
            },
          ],
        };
      }

      case 'info': {
        const activeCount =
          ctx.config.builtInCommands.filter((c) => c.enabled).length +
          ctx.config.customCommands.filter((c) => c.enabled).length;
        return {
          matched: true,
          commandUsed: `${prefix}info`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Info del bot',
          replies: [
            {
              type: 'text',
              text: [
                `*${ctx.config.botName}*`,
                `• Administrador: ${ctx.config.ownerName}`,
                `• Prefijo: *${prefix}*`,
                `• Comandos activos: ${activeCount}`,
                `• Pack de stickers: ${ctx.config.stickerPack} (${ctx.config.stickerAuthor})`,
                `• Grupos: ${ctx.config.respondInGroups ? 'Habilitado' : 'Deshabilitado'}`,
              ].join('\n'),
            },
          ],
        };
      }

      case 'dado': {
        const sides = argParts[0] ? parseInt(argParts[0], 10) : 6;
        const validSides = Number.isFinite(sides) && sides >= 2 && sides <= 1000 ? sides : 6;
        const roll = Math.floor(Math.random() * validSides) + 1;
        return {
          matched: true,
          commandUsed: `${prefix}dado`,
          stickerGenerated: false,
          status: 'ok',
          detail: `Resultado ${roll}/${validSides}`,
          replies: [
            {
              type: 'text',
              text: `Lanzamiento de dado (${validSides} caras): salió *${roll}*.`,
            },
          ],
        };
      }

      case 'moneda': {
        const result = Math.random() < 0.5 ? 'Cara' : 'Cruz';
        return {
          matched: true,
          commandUsed: `${prefix}moneda`,
          stickerGenerated: false,
          status: 'ok',
          detail: result,
          replies: [{ type: 'text', text: `Lanzaste la moneda y salió: *${result}*.` }],
        };
      }

      case 'elegir': {
        const options = argsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (options.length < 2) {
          return {
            matched: true,
            commandUsed: `${prefix}elegir`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Opciones insuficientes',
            replies: [
              {
                type: 'text',
                text: `Escribe al menos dos opciones separadas por coma. Ejemplo: *${prefix}elegir Pizza, Hamburguesa, Tacos*`,
              },
            ],
          };
        }
        const chosen = options[Math.floor(Math.random() * options.length)];
        return {
          matched: true,
          commandUsed: `${prefix}elegir`,
          stickerGenerated: false,
          status: 'ok',
          detail: `Elegido: ${chosen}`,
          replies: [
            {
              type: 'text',
              text: `Entre ${options.length} opciones, elijo: *${chosen}*`,
            },
          ],
        };
      }

      case 'calc': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}calc`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta expresión',
            replies: [
              {
                type: 'text',
                text: `Escribe una operación matemática. Ejemplo: *${prefix}calc (45 + 15) * 3*`,
              },
            ],
          };
        }
        const result = safeEvaluateMath(argsText);
        const formatted = Number.isInteger(result) ? String(result) : Number(result.toFixed(6)).toString();
        return {
          matched: true,
          commandUsed: `${prefix}calc`,
          stickerGenerated: false,
          status: 'ok',
          detail: `= ${formatted}`,
          replies: [{ type: 'text', text: `${argsText} = *${formatted}*` }],
        };
      }

      case 'morse': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}morse`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta texto',
            replies: [{ type: 'text', text: `Ejemplo: *${prefix}morse HOLA MUNDO*` }],
          };
        }
        const morse = argsText
          .toUpperCase()
          .replace(/Ñ/g, '\u0000')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\u0000/g, 'Ñ')
          .split('')
          .map((ch) => (ch === ' ' ? '/' : MORSE_MAP[ch] ?? ch))
          .join(' ');
        return {
          matched: true,
          commandUsed: `${prefix}morse`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Convertido a Morse',
          replies: [{ type: 'text', text: `Código Morse:\n\`${morse}\`` }],
        };
      }

      case 'binario': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}binario`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta texto',
            replies: [{ type: 'text', text: `Ejemplo: *${prefix}binario Bot*` }],
          };
        }
        const binary = Array.from(Buffer.from(argsText.slice(0, 80), 'utf-8'))
          .map((b) => b.toString(2).padStart(8, '0'))
          .join(' ');
        return {
          matched: true,
          commandUsed: `${prefix}binario`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Convertido a binario',
          replies: [{ type: 'text', text: `Binario (UTF-8):\n\`${binary}\`` }],
        };
      }

      case 'clima': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}clima`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta ciudad',
            replies: [{ type: 'text', text: `Indica una ciudad. Ejemplo: *${prefix}clima Madrid*` }],
          };
        }

        // Primary: Open-Meteo (10s timeout) -> Fallback: wttr.in (fast & handles short names like Lima)
        try {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            argsText
          )}&count=1&language=es&format=json`;
          const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(10_000) });
          const geoData = (await geoRes.json()) as {
            results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>;
          };
          const place = geoData.results?.[0];
          if (place) {
            const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto`;
            const wxRes = await fetch(wxUrl, { signal: AbortSignal.timeout(10_000) });
            const wxData = (await wxRes.json()) as {
              current?: {
                temperature_2m: number;
                relative_humidity_2m: number;
                apparent_temperature: number;
                wind_speed_10m: number;
                weather_code: number;
              };
            };
            const cur = wxData.current;
            if (cur) {
              const cond = WEATHER_CODES[cur.weather_code] ?? 'Variable';
              return {
                matched: true,
                commandUsed: `${prefix}clima`,
                stickerGenerated: false,
                status: 'ok',
                detail: `${place.name}: ${cur.temperature_2m}°C`,
                replies: [
                  {
                    type: 'text',
                    text: [
                      `*Clima en ${place.name}${place.country ? `, ${place.country}` : ''}*`,
                      `• Estado: ${cond}`,
                      `• Temperatura: ${cur.temperature_2m} °C (Sensación ${cur.apparent_temperature} °C)`,
                      `• Humedad: ${cur.relative_humidity_2m}%`,
                      `• Viento: ${cur.wind_speed_10m} km/h`,
                    ].join('\n'),
                  },
                ],
              };
            }
          }
        } catch {
          // Fall through to wttr.in
        }

        // Secondary: wttr.in
        const wttrRes = await fetch(
          `https://wttr.in/${encodeURIComponent(argsText)}?format=j1&lang=es`,
          {
            headers: { 'User-Agent': 'curl/8.0' },
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!wttrRes.ok) {
          return {
            matched: true,
            commandUsed: `${prefix}clima`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Ciudad no encontrada',
            replies: [{ type: 'text', text: `No encontré resultados de clima para "${argsText}".` }],
          };
        }
        const wttr = (await wttrRes.json()) as {
          current_condition?: Array<{
            temp_C?: string;
            FeelsLikeC?: string;
            humidity?: string;
            windspeedKmph?: string;
            lang_es?: Array<{ value: string }>;
            weatherDesc?: Array<{ value: string }>;
          }>;
          nearest_area?: Array<{
            areaName?: Array<{ value: string }>;
            country?: Array<{ value: string }>;
          }>;
        };
        const cc = wttr.current_condition?.[0];
        if (!cc) {
          return {
            matched: true,
            commandUsed: `${prefix}clima`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Ciudad no encontrada',
            replies: [{ type: 'text', text: `No encontré resultados de clima para "${argsText}".` }],
          };
        }
        const areaName = wttr.nearest_area?.[0]?.areaName?.[0]?.value || argsText;
        const country = wttr.nearest_area?.[0]?.country?.[0]?.value;
        const desc = cc.lang_es?.[0]?.value || cc.weatherDesc?.[0]?.value || 'Variable';
        return {
          matched: true,
          commandUsed: `${prefix}clima`,
          stickerGenerated: false,
          status: 'ok',
          detail: `${areaName}: ${cc.temp_C}°C`,
          replies: [
            {
              type: 'text',
              text: [
                `*Clima en ${areaName}${country ? `, ${country}` : ''}*`,
                `• Estado: ${desc}`,
                `• Temperatura: ${cc.temp_C} °C (Sensación ${cc.FeelsLikeC} °C)`,
                `• Humedad: ${cc.humidity}%`,
                `• Viento: ${cc.windspeedKmph} km/h`,
              ].join('\n'),
            },
          ],
        };
      }

      case 'divisa': {
        const match = argsText.match(/^(\d+(?:[.,]\d+)?)\s+([a-zA-Z]{3})\s+([a-zA-Z]{3})$/);
        if (!match) {
          return {
            matched: true,
            commandUsed: `${prefix}divisa`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Formato inválido',
            replies: [
              {
                type: 'text',
                text: `Uso correcto: *${prefix}divisa 100 USD ARS* (o MXN, COP, CLP, PEN, EUR)`,
              },
            ],
          };
        }
        const amount = Number(match[1].replace(',', '.'));
        const from = match[2].toUpperCase();
        const to = match[3].toUpperCase();
        if (amount <= 0) {
          throw new Error('El monto debe ser mayor a 0');
        }

        let converted: number | null = null;
        let dateLabel = 'Hoy';

        try {
          const erRes = await fetch(
            `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (erRes.ok) {
            const erData = (await erRes.json()) as {
              result?: string;
              time_last_update_utc?: string;
              rates?: Record<string, number>;
            };
            const rate = erData.rates?.[to];
            if (erData.result === 'success' && typeof rate === 'number') {
              converted = amount * rate;
              if (erData.time_last_update_utc) {
                dateLabel = new Date(erData.time_last_update_utc).toLocaleDateString('es-PE', {
                  timeZone: PERU_TIMEZONE,
                });
              }
            }
          }
        } catch {
          // Fallback below
        }

        if (converted === null) {
          const fxUrl = `https://api.frankfurter.app/latest?amount=${encodeURIComponent(
            String(amount)
          )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
          const fxRes = await fetch(fxUrl, { signal: AbortSignal.timeout(6000) });
          if (fxRes.ok) {
            const fxData = (await fxRes.json()) as {
              date?: string;
              rates?: Record<string, number>;
            };
            if (typeof fxData.rates?.[to] === 'number') {
              converted = fxData.rates[to];
              dateLabel = fxData.date ?? 'Hoy';
            }
          }
        }

        if (converted === null) {
          return {
            matched: true,
            commandUsed: `${prefix}divisa`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Divisa no soportada',
            replies: [
              {
                type: 'text',
                text: `No encontré cotización para convertir de ${from} a ${to}. Verifica los códigos ISO (ej. USD, EUR, ARS, MXN, COP, CLP, PEN, BRL).`,
              },
            ],
          };
        }

        return {
          matched: true,
          commandUsed: `${prefix}divisa`,
          stickerGenerated: false,
          status: 'ok',
          detail: `${amount} ${from} = ${converted.toFixed(2)} ${to}`,
          replies: [
            {
              type: 'text',
              text: `*Conversión de divisa*\n${amount.toLocaleString('es-ES')} ${from} = *${converted.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${to}*\nReferencia: ${dateLabel}`,
            },
          ],
        };
      }

      case 'chiste': {
        const joke = CHISTES[Math.floor(Math.random() * CHISTES.length)];
        return {
          matched: true,
          commandUsed: `${prefix}chiste`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Chiste enviado',
          replies: [{ type: 'text', text: joke }],
        };
      }

      case 'frase': {
        const quote = FRASES[Math.floor(Math.random() * FRASES.length)];
        return {
          matched: true,
          commandUsed: `${prefix}frase`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Frase enviada',
          replies: [{ type: 'text', text: quote }],
        };
      }

      case 'tagall': {
        const participants = ctx.groupParticipants ?? [];
        const headline = argsText || 'Atención a todo el grupo';
        const lines = participants.map((jid) => `@${jid.split('@')[0]}`);
        return {
          matched: true,
          commandUsed: `${prefix}tagall`,
          stickerGenerated: false,
          status: 'ok',
          detail: `${participants.length} menciones`,
          replies: [
            {
              type: 'text',
              text: `*${headline}*\n\n${lines.join(' ')}`,
              mentions: participants,
            },
          ],
        };
      }

      case 'hidetag': {
        const participants = ctx.groupParticipants ?? [];
        const notice = argsText || 'Aviso importante del grupo.';
        return {
          matched: true,
          commandUsed: `${prefix}hidetag`,
          stickerGenerated: false,
          status: 'ok',
          detail: `Aviso silencioso (${participants.length})`,
          replies: [
            {
              type: 'text',
              text: notice,
              mentions: participants,
            },
          ],
        };
      }

      case 'grupo': {
        const total = ctx.groupParticipants?.length ?? 0;
        const admins = ctx.groupAdminCount ?? 0;
        return {
          matched: true,
          commandUsed: `${prefix}grupo`,
          stickerGenerated: false,
          status: 'ok',
          detail: ctx.groupName ?? 'Grupo',
          replies: [
            {
              type: 'text',
              text: [
                `*Información del Grupo*`,
                `• Nombre: ${ctx.groupName || 'Grupo de WhatsApp'}`,
                `• Participantes: ${total}`,
                `• Administradores: ${admins}`,
              ].join('\n'),
            },
          ],
        };
      }

      case 'reglas': {
        return {
          matched: true,
          commandUsed: `${prefix}reglas`,
          stickerGenerated: false,
          status: 'ok',
          detail: 'Reglas enviadas',
          replies: [
            {
              type: 'text',
              text: `*Reglas del grupo*\n\n${ctx.config.rulesText}`,
            },
          ],
        };
      }

      case 'tiktok': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}tiktok`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta enlace de TikTok',
            replies: [
              {
                type: 'text',
                text: `Pega un enlace de TikTok para descargarlo sin marca de agua.\nEjemplo: *${prefix}tiktok https://www.tiktok.com/@tiktok/video/7106594312292453675*`,
              },
            ],
          };
        }

        const audioOnly = argParts[0]?.toLowerCase() === 'audio';
        const rawCandidate = audioOnly ? argParts.slice(1).join(' ') : argsText;
        const urlMatch = rawCandidate.match(/https?:\/\/\S+/i);
        const validUrl = urlMatch
          ? validateAllowedDownloadUrl(urlMatch[0], ['tiktok.com'])
          : null;

        if (!validUrl) {
          return {
            matched: true,
            commandUsed: `${prefix}tiktok`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Enlace inválido',
            replies: [
              {
                type: 'text',
                text: 'Ese enlace no parece ser de TikTok (`tiktok.com`, `vm.tiktok.com` o `vt.tiktok.com`).',
              },
            ],
          };
        }

        const tt = await ttdl(validUrl);
        if (audioOnly) {
          if (!tt.music) {
            throw new Error('No se encontró una pista de audio descargable en este TikTok.');
          }
          const { buffer, contentType } = await downloadMediaBuffer(tt.music);
          const mimetype = contentType.startsWith('audio/')
            ? contentType.split(';')[0].trim()
            : 'audio/mpeg';
          const audioLabel = tt.author || tt.username || 'TikTok';

          return {
            matched: true,
            commandUsed: `${prefix}tiktok`,
            stickerGenerated: false,
            status: 'ok',
            detail: `Audio TikTok (${(buffer.length / (1024 * 1024)).toFixed(1)} MB)`,
            replies: [
              {
                type: 'audio',
                buffer,
                mimetype,
                externalUrl: tt.music,
                caption: `Audio de TikTok · ${audioLabel}`,
              },
            ],
          };
        }

        const videoUrl = tt.video_hd || tt.video || tt.video_wm;
        if (!videoUrl) {
          throw new Error('No se encontró el video en ese enlace de TikTok.');
        }

        const { buffer } = await downloadMediaBuffer(videoUrl);
        const caption = [
          tt.author ? `*${tt.author}* (@${tt.username || 'tiktok'})` : '*Video de TikTok*',
          tt.title ? tt.title.slice(0, 180) : '',
        ]
          .filter(Boolean)
          .join('\n');

        return {
          matched: true,
          commandUsed: `${prefix}tiktok`,
          stickerGenerated: false,
          status: 'ok',
          detail: `Video TikTok (${(buffer.length / (1024 * 1024)).toFixed(1)} MB)`,
          replies: [
            {
              type: 'video',
              buffer,
              externalUrl: videoUrl,
              caption,
            },
          ],
        };
      }

      case 'ig': {
        if (!argsText) {
          return {
            matched: true,
            commandUsed: `${prefix}ig`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta enlace de Instagram',
            replies: [
              {
                type: 'text',
                text: `Pega un enlace público de Reel o publicación de Instagram.\nEjemplo: *${prefix}ig https://www.instagram.com/reel/C85BZjeSHuO/*`,
              },
            ],
          };
        }

        const urlMatch = argsText.match(/https?:\/\/\S+/i);
        const validUrl = urlMatch
          ? validateAllowedDownloadUrl(urlMatch[0], ['instagram.com', 'instagr.am'])
          : null;

        if (!validUrl) {
          return {
            matched: true,
            commandUsed: `${prefix}ig`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Enlace inválido',
            replies: [
              {
                type: 'text',
                text: 'Ese enlace no parece ser de Instagram (`instagram.com/reel/...` o `instagram.com/p/...`).',
              },
            ],
          };
        }

        const igResult = await Promise.race([
          igdl2(validUrl),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Tiempo de espera agotado al consultar Instagram.')), 45_000)
          ),
        ]);

        const firstMedia = igResult?.data?.[0];
        if (!igResult?.status || !firstMedia?.url) {
          throw new Error('No se pudo obtener el contenido. Verifica que la cuenta o publicación sea pública.');
        }

        const { buffer, contentType } = await downloadMediaBuffer(firstMedia.url);
        const isImage = contentType.startsWith('image/');

        return {
          matched: true,
          commandUsed: `${prefix}ig`,
          stickerGenerated: false,
          status: 'ok',
          detail: `Instagram ${isImage ? 'imagen' : 'video'} (${(buffer.length / (1024 * 1024)).toFixed(1)} MB)`,
          replies: [
            isImage
              ? {
                  type: 'image',
                  buffer,
                  caption: 'Publicación descargada de Instagram',
                }
              : {
                  type: 'video',
                  buffer,
                  externalUrl: firstMedia.url,
                  caption: 'Reel / Video descargado de Instagram',
                },
          ],
        };
      }

      case 'recordar': {
        const targetJid = ctx.targetJid || ctx.senderId;
        const source = ctx.source || 'simulator';
        const sub = argParts[0]?.toLowerCase();

        if (!argsText || sub === 'ayuda') {
          return {
            matched: true,
            commandUsed: `${prefix}recordar`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Falta tiempo y mensaje',
            replies: [
              {
                type: 'text',
                text: [
                  `*Cómo usar ${prefix}recordar*`,
                  `• \`${prefix}recordar 15s Revisar el horno\``,
                  `• \`${prefix}recordar 10m Reunión de equipo\``,
                  `• \`${prefix}recordar 1h30m Tomar medicación\``,
                  `• \`${prefix}recordar lista\` — ver tus recordatorios pendientes`,
                  `• \`${prefix}recordar cancelar 1\` — cancelar un recordatorio`,
                ].join('\n'),
              },
            ],
          };
        }

        if (sub === 'lista' || sub === 'list') {
          const items = reminderService.listForTarget(targetJid);
          if (items.length === 0) {
            return {
              matched: true,
              commandUsed: `${prefix}recordar`,
              stickerGenerated: false,
              status: 'ok',
              detail: 'Sin recordatorios',
              replies: [{ type: 'text', text: 'No tienes recordatorios pendientes en este chat.' }],
            };
          }
          const lines = items.map((item, idx) => {
            const mins = Math.max(1, Math.ceil((item.dueAt - Date.now()) / 60_000));
            const secs = Math.max(1, Math.ceil((item.dueAt - Date.now()) / 1000));
            const eta = secs < 60 ? `en ${secs} s` : `en ~${mins} min`;
            return `${idx + 1}. *${item.message}* (${eta}) · ID \`${item.id}\``;
          });
          return {
            matched: true,
            commandUsed: `${prefix}recordar`,
            stickerGenerated: false,
            status: 'ok',
            detail: `${items.length} recordatorios`,
            replies: [{ type: 'text', text: `*Recordatorios activos*\n\n${lines.join('\n')}` }],
          };
        }

        if (sub === 'cancelar' || sub === 'borrar') {
          const key = argParts[1];
          if (!key) {
            return {
              matched: true,
              commandUsed: `${prefix}recordar`,
              stickerGenerated: false,
              status: 'error',
              detail: 'Falta número o ID',
              replies: [
                {
                  type: 'text',
                  text: `Indica el número o ID del recordatorio. Ejemplo: *${prefix}recordar cancelar 1*`,
                },
              ],
            };
          }
          const removed = reminderService.cancelForTarget(targetJid, key);
          if (!removed) {
            return {
              matched: true,
              commandUsed: `${prefix}recordar`,
              stickerGenerated: false,
              status: 'error',
              detail: 'No encontrado',
              replies: [{ type: 'text', text: `No encontré ningún recordatorio con "${key}".` }],
            };
          }
          return {
            matched: true,
            commandUsed: `${prefix}recordar`,
            stickerGenerated: false,
            status: 'ok',
            detail: 'Recordatorio cancelado',
            replies: [
              { type: 'text', text: `Recordatorio cancelado: *${removed.message}*` },
            ],
          };
        }

        const parsed = parseDurationMs(argParts[0] || '');
        const reminderMsg = argParts.slice(1).join(' ').trim();
        if (!parsed || !reminderMsg) {
          return {
            matched: true,
            commandUsed: `${prefix}recordar`,
            stickerGenerated: false,
            status: 'error',
            detail: 'Formato de tiempo inválido',
            replies: [
              {
                type: 'text',
                text: `Formato: *${prefix}recordar <tiempo> <mensaje>* (de 5s a 7d).\nEjemplo: *${prefix}recordar 20s Tomar agua*`,
              },
            ],
          };
        }

        const dueAt = Date.now() + parsed.ms;
        const created = reminderService.addReminder({
          source,
          targetJid,
          senderId: ctx.senderId,
          senderName: ctx.senderName,
          message: reminderMsg.slice(0, 500),
          dueAt,
        });

        const dueTimeStr = new Date(dueAt).toLocaleTimeString('es-PE', {
          timeZone: PERU_TIMEZONE,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        return {
          matched: true,
          commandUsed: `${prefix}recordar`,
          stickerGenerated: false,
          status: 'ok',
          detail: `Programado en ${parsed.label}`,
          replies: [
            {
              type: 'text',
              text: `Recordatorio guardado para dentro de *${parsed.label}* (a las ${dueTimeStr}):\n«${created.message}»`,
            },
          ],
        };
      }

      default:
        return {
          matched: false,
          commandUsed: null,
          stickerGenerated: false,
          status: 'ignored',
          detail: 'No implementado',
          replies: [],
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al ejecutar el comando';
    return {
      matched: true,
      commandUsed: `${prefix}${builtIn.trigger}`,
      stickerGenerated: false,
      status: 'error',
      detail: message,
      replies: [{ type: 'text', text: `No se pudo completar *${prefix}${builtIn.trigger}*: ${message}` }],
    };
  }
}
