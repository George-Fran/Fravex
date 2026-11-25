import fs from 'node:fs';
import path from 'node:path';
import type { BotConfig, BuiltInCommandConfig, CustomCommandConfig } from '../src/types/bot.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'bot-config.json');

export const DEFAULT_BUILTIN_COMMANDS: BuiltInCommandConfig[] = [
  {
    id: 'menu',
    trigger: 'menu',
    aliases: ['ayuda', 'help', 'comandos'],
    category: 'info',
    description: 'Muestra la lista completa de comandos disponibles organizados por categoría.',
    usage: '/menu',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'sticker',
    trigger: 'sticker',
    aliases: ['s', 'stiker', 'pegatina'],
    category: 'stickers',
    description: 'Convierte cualquier imagen enviada o citada en un sticker WebP 512x512.',
    usage: '/sticker [recorte]',
    enabled: true,
    adminOnly: false,
    requiresImage: true,
  },
  {
    id: 'stickert',
    trigger: 'stickert',
    aliases: ['tiktoksticker', 'stikert', 'stt'],
    category: 'stickers',
    description: 'Recorta automáticamente una captura de sticker de TikTok y la convierte en sticker de WhatsApp.',
    usage: '/stickert',
    enabled: true,
    adminOnly: false,
    requiresImage: true,
  },
  {
    id: 'ttp',
    trigger: 'ttp',
    aliases: ['textosticker', 'ts'],
    category: 'stickers',
    description: 'Genera un sticker 512x512 directamente a partir de un texto estilizado.',
    usage: '/ttp Hola Mundo',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'qr',
    trigger: 'qr',
    aliases: ['codigoqr'],
    category: 'stickers',
    description: 'Crea una imagen de código QR escaneable a partir de cualquier enlace o texto.',
    usage: '/qr https://ejemplo.com',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'ping',
    trigger: 'ping',
    aliases: ['p', 'estado'],
    category: 'info',
    description: 'Mide el tiempo de respuesta y muestra cuánto tiempo lleva activo el bot.',
    usage: '/ping',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'info',
    trigger: 'info',
    aliases: ['bot', 'acerca'],
    category: 'info',
    description: 'Muestra la configuración actual del bot, prefijo y paquete de stickers.',
    usage: '/info',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'dado',
    trigger: 'dado',
    aliases: ['roll', 'd'],
    category: 'utilidades',
    description: 'Lanza un dado de 6 caras o del número de caras que indiques.',
    usage: '/dado [20]',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'moneda',
    trigger: 'moneda',
    aliases: ['flip', 'caraocruz'],
    category: 'utilidades',
    description: 'Lanza una moneda al aire y devuelve Cara o Cruz.',
    usage: '/moneda',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'elegir',
    trigger: 'elegir',
    aliases: ['sorteo', 'pick'],
    category: 'utilidades',
    description: 'Elige una opción aleatoria entre varias separadas por coma.',
    usage: '/elegir Pizza, Tacos, Sushi',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'calc',
    trigger: 'calc',
    aliases: ['calcular', 'math'],
    category: 'utilidades',
    description: 'Resuelve operaciones aritméticas (+, -, *, /, %, ^ y paréntesis).',
    usage: '/calc (125 * 4) / 5',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'morse',
    trigger: 'morse',
    aliases: [],
    category: 'utilidades',
    description: 'Convierte un texto normal a código Morse.',
    usage: '/morse SOS HOLA',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'binario',
    trigger: 'binario',
    aliases: ['bin'],
    category: 'utilidades',
    description: 'Codifica cualquier texto a representación binaria de 8 bits.',
    usage: '/binario Bot',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'clima',
    trigger: 'clima',
    aliases: ['tiempo', 'weather'],
    category: 'info',
    description: 'Consulta la temperatura, viento y estado del tiempo actual en cualquier ciudad.',
    usage: '/clima Buenos Aires',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'divisa',
    trigger: 'divisa',
    aliases: ['cambio', 'monedas'],
    category: 'info',
    description: 'Convierte montos entre divisas internacionales en tiempo real.',
    usage: '/divisa 100 USD MXN',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'chiste',
    trigger: 'chiste',
    aliases: ['humor'],
    category: 'utilidades',
    description: 'Envía un chiste corto aleatorio en español.',
    usage: '/chiste',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'frase',
    trigger: 'frase',
    aliases: ['cita'],
    category: 'utilidades',
    description: 'Comparte una frase breve sobre tecnología, creatividad o enfoque.',
    usage: '/frase',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'tagall',
    trigger: 'tagall',
    aliases: ['todos', 'mencionar'],
    category: 'grupos',
    description: 'Menciona a todos los miembros del grupo con un mensaje de aviso.',
    usage: '/tagall Reunión a las 18:00',
    enabled: true,
    adminOnly: true,
    groupOnly: true,
  },
  {
    id: 'hidetag',
    trigger: 'hidetag',
    aliases: ['aviso'],
    category: 'grupos',
    description: 'Envía un mensaje grupal notificando a todos sin mostrar la lista de menciones.',
    usage: '/hidetag Revisar el mensaje fijado',
    enabled: true,
    adminOnly: true,
    groupOnly: true,
  },
  {
    id: 'grupo',
    trigger: 'grupo',
    aliases: ['groupinfo'],
    category: 'grupos',
    description: 'Muestra el nombre del grupo, cantidad de miembros y administradores.',
    usage: '/grupo',
    enabled: true,
    adminOnly: false,
    groupOnly: true,
  },
  {
    id: 'reglas',
    trigger: 'reglas',
    aliases: ['normas'],
    category: 'grupos',
    description: 'Envía las reglas configuradas para la comunidad o grupo.',
    usage: '/reglas',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'tiktok',
    trigger: 'tiktok',
    aliases: ['tt', 'tik'],
    category: 'stickers',
    description: 'Descarga videos de TikTok sin marca de agua (o audio con /tiktok audio <enlace>).',
    usage: '/tiktok https://www.tiktok.com/@tiktok/video/7106594312292453675',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'ig',
    trigger: 'ig',
    aliases: ['instagram', 'reel'],
    category: 'stickers',
    description: 'Descarga reels, videos o publicaciones públicas de Instagram.',
    usage: '/ig https://www.instagram.com/reel/C85BZjeSHuO/',
    enabled: true,
    adminOnly: false,
  },
  {
    id: 'recordar',
    trigger: 'recordar',
    aliases: ['rec', 'recordatorio', 'alarma'],
    category: 'utilidades',
    description: 'Programa un recordatorio automático (ej. /recordar 15s Revisar horno, /recordar lista).',
    usage: '/recordar 15s Tomar agua',
    enabled: true,
    adminOnly: false,
  },
];

export const DEFAULT_BOT_CONFIG: BotConfig = {
  botName: 'FRAVEX',
  prefix: '/',
  ownerName: 'Administrador',
  stickerPack: 'FRAVEX Stickers',
  stickerAuthor: 'FRAVEX',
  respondInGroups: true,
  autoRead: true,
  cooldownSeconds: 2,
  rulesText:
    '1. Respetar a todos los participantes.\n2. Evitar spam o enlaces no autorizados.\n3. Usar los comandos con moderación.',
  builtInCommands: DEFAULT_BUILTIN_COMMANDS,
  customCommands: [
    {
      id: 'custom-saludo',
      trigger: 'hola',
      description: 'Respuesta de bienvenida personalizada con el nombre del usuario.',
      response: 'Hola {usuario}, soy {bot}. Escribe /menu para ver todos los comandos disponibles.',
      enabled: true,
      adminOnly: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'custom-horario',
      trigger: 'horario',
      description: 'Muestra el horario de atención configurado.',
      response: 'Nuestro horario de atención es de Lunes a Viernes, de 09:00 a 18:00 hs.',
      enabled: true,
      adminOnly: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadBotConfig(): BotConfig {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    saveBotConfig(DEFAULT_BOT_CONFIG);
    return structuredClone(DEFAULT_BOT_CONFIG);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BotConfig>;

    const existingBuiltIns = new Map(
      (parsed.builtInCommands ?? []).map((cmd) => [cmd.id, cmd])
    );

    const mergedBuiltIns = DEFAULT_BUILTIN_COMMANDS.map((def) => {
      const saved = existingBuiltIns.get(def.id);
      return saved
        ? {
            ...def,
            enabled: typeof saved.enabled === 'boolean' ? saved.enabled : def.enabled,
            adminOnly: typeof saved.adminOnly === 'boolean' ? saved.adminOnly : def.adminOnly,
          }
        : { ...def };
    });

    return {
      botName: parsed.botName?.trim() || DEFAULT_BOT_CONFIG.botName,
      prefix: normalizePrefix(parsed.prefix),
      ownerName: parsed.ownerName?.trim() || DEFAULT_BOT_CONFIG.ownerName,
      stickerPack: parsed.stickerPack?.trim() || DEFAULT_BOT_CONFIG.stickerPack,
      stickerAuthor: parsed.stickerAuthor?.trim() || DEFAULT_BOT_CONFIG.stickerAuthor,
      respondInGroups:
        typeof parsed.respondInGroups === 'boolean'
          ? parsed.respondInGroups
          : DEFAULT_BOT_CONFIG.respondInGroups,
      autoRead:
        typeof parsed.autoRead === 'boolean' ? parsed.autoRead : DEFAULT_BOT_CONFIG.autoRead,
      cooldownSeconds:
        typeof parsed.cooldownSeconds === 'number' &&
        parsed.cooldownSeconds >= 0 &&
        parsed.cooldownSeconds <= 60
          ? parsed.cooldownSeconds
          : DEFAULT_BOT_CONFIG.cooldownSeconds,
      rulesText: parsed.rulesText ?? DEFAULT_BOT_CONFIG.rulesText,
      builtInCommands: mergedBuiltIns,
      customCommands: Array.isArray(parsed.customCommands)
        ? parsed.customCommands
        : DEFAULT_BOT_CONFIG.customCommands,
    };
  } catch {
    saveBotConfig(DEFAULT_BOT_CONFIG);
    return structuredClone(DEFAULT_BOT_CONFIG);
  }
}

export function saveBotConfig(config: BotConfig): BotConfig {
  ensureDataDir();
  const sanitized: BotConfig = {
    ...config,
    botName: config.botName.trim().slice(0, 48) || DEFAULT_BOT_CONFIG.botName,
    prefix: normalizePrefix(config.prefix),
    ownerName: config.ownerName.trim().slice(0, 48) || DEFAULT_BOT_CONFIG.ownerName,
    stickerPack: config.stickerPack.trim().slice(0, 48) || DEFAULT_BOT_CONFIG.stickerPack,
    stickerAuthor: config.stickerAuthor.trim().slice(0, 48) || DEFAULT_BOT_CONFIG.stickerAuthor,
    cooldownSeconds: Math.max(0, Math.min(60, Math.round(Number(config.cooldownSeconds) || 0))),
    rulesText: String(config.rulesText || '').slice(0, 1500),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitized, null, 2), 'utf-8');
  return sanitized;
}

export function normalizePrefix(prefix?: string): string {
  const trimmed = (prefix ?? '/').trim();
  if (!trimmed) return '/';
  const allowed = ['/', '!', '.', '#', '$', '?'];
  const firstChar = trimmed[0];
  return allowed.includes(firstChar) ? firstChar : '/';
}

export function sanitizeTrigger(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[/!.#$?]+/, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
}

export function addCustomCommand(
  config: BotConfig,
  input: { trigger: string; description: string; response: string; adminOnly?: boolean }
): { config: BotConfig; created: CustomCommandConfig } {
  const trigger = sanitizeTrigger(input.trigger);
  if (!trigger) {
    throw new Error('El nombre del comando solo puede contener letras minúsculas, números, guiones o guiones bajos.');
  }

  const builtInConflict = config.builtInCommands.some(
    (c) => c.trigger === trigger || c.aliases.includes(trigger)
  );
  if (builtInConflict) {
    throw new Error(`El comando "${trigger}" ya existe como comando integrado.`);
  }

  const customConflict = config.customCommands.some((c) => c.trigger === trigger);
  if (customConflict) {
    throw new Error(`Ya existe un comando personalizado llamado "${trigger}".`);
  }

  const response = input.response.trim();
  if (!response) {
    throw new Error('La respuesta del comando no puede estar vacía.');
  }

  const created: CustomCommandConfig = {
    id: `custom-${Date.now().toString(36)}`,
    trigger,
    description: input.description.trim().slice(0, 140) || `Comando personalizado ${config.prefix}${trigger}`,
    response: response.slice(0, 2000),
    enabled: true,
    adminOnly: Boolean(input.adminOnly),
    createdAt: new Date().toISOString(),
  };

  const next: BotConfig = {
    ...config,
    customCommands: [...config.customCommands, created],
  };

  return { config: saveBotConfig(next), created };
}
