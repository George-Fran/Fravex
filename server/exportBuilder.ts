import JSZip from 'jszip';
import type { BotConfig } from '../src/types/bot.ts';

export async function buildStandaloneBotZip(config: BotConfig): Promise<Buffer> {
  const zip = new JSZip();

  const packageJson = {
    name: 'mi-bot-whatsapp',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
    },
    dependencies: {
      '@whiskeysockets/baileys': '^7.0.0-rc14',
      pino: '^10.4.0',
      qrcode: '^1.5.4',
      'qrcode-terminal': '^0.12.0',
      sharp: '^0.35.5',
    },
  };

  const standaloneConfig = {
    botName: config.botName,
    prefix: config.prefix,
    ownerName: config.ownerName,
    stickerPack: config.stickerPack,
    stickerAuthor: config.stickerAuthor,
    respondInGroups: config.respondInGroups,
    autoRead: config.autoRead,
    cooldownSeconds: config.cooldownSeconds,
    rulesText: config.rulesText,
    enabledBuiltIns: config.builtInCommands.filter((c) => c.enabled).map((c) => c.id),
    customCommands: config.customCommands.filter((c) => c.enabled),
  };

  const indexJs = `import fs from 'node:fs';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import sharp from 'sharp';

const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf-8'));
const logger = pino({ level: 'silent' });
const cooldowns = new Map();

async function toStickerWebp(buffer, crop = false) {
  return sharp(buffer)
    .rotate()
    .resize(512, 512, {
      fit: crop ? 'cover' : 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 88 })
    .toBuffer();
}

async function textToSticker(text) {
  const safe = text.slice(0, 60).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect x="24" y="24" width="464" height="464" rx="56" fill="#ecfdf5" stroke="#16a34a" stroke-width="10" />
    <text x="256" y="275" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="64" fill="#0f172a">\${safe}</text>
  </svg>\`;
  return sharp(Buffer.from(svg)).resize(512, 512).webp({ quality: 92 }).toBuffer();
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Escanea este código QR desde WhatsApp > Dispositivos vinculados:');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log(\`\${config.botName} conectado a WhatsApp correctamente.\`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        startBot();
      } else {
        console.log('Sesión cerrada. Borra la carpeta auth_info para volver a vincular.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) continue;
      const isGroup = remoteJid.endsWith('@g.us');
      if (isGroup && !config.respondInGroups) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!text.startsWith(config.prefix)) continue;

      const sender = msg.key.participant || remoteJid;
      const now = Date.now();
      if (config.cooldownSeconds > 0 && now - (cooldowns.get(sender) || 0) < config.cooldownSeconds * 1000) {
        continue;
      }
      cooldowns.set(sender, now);

      if (config.autoRead) {
        await sock.readMessages([msg.key]);
      }

      const body = text.slice(config.prefix.length).trim();
      const [rawCmd, ...args] = body.split(/\\s+/);
      const cmd = rawCmd.toLowerCase();
      const argsText = body.slice(rawCmd.length).trim();

      const custom = config.customCommands.find((c) => c.trigger === cmd);
      if (custom) {
        const replyText = custom.response
          .replace(/\\{usuario\\}/gi, msg.pushName || 'Usuario')
          .replace(/\\{bot\\}/gi, config.botName)
          .replace(/\\{args\\}/gi, argsText);
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
        continue;
      }

      if (cmd === 'menu' || cmd === 'ayuda') {
        const list = [
          \`*\${config.botName}*\`,
          \`• \${config.prefix}sticker (envía o responde a una foto)\`,
          \`• \${config.prefix}stickert (recorta captura de sticker de TikTok)\`,
          \`• \${config.prefix}ttp <texto>\`,
          \`• \${config.prefix}qr <enlace>\`,
          \`• \${config.prefix}dado | \${config.prefix}moneda | \${config.prefix}ping\`,
          ...config.customCommands.map((c) => \`• \${config.prefix}\${c.trigger} — \${c.description}\`),
        ].join('\\n');
        await sock.sendMessage(remoteJid, { text: list }, { quoted: msg });
      } else if (cmd === 'sticker' || cmd === 's' || cmd === 'stickert' || cmd === 'stt') {
        const quotedImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        const targetMsg = msg.message.imageMessage
          ? msg
          : quotedImage
          ? { key: msg.key, message: { imageMessage: quotedImage } }
          : null;

        if (!targetMsg) {
          await sock.sendMessage(remoteJid, { text: \`Envía o responde a una imagen con \${config.prefix}\${cmd}\` }, { quoted: msg });
          continue;
        }
        const media = await downloadMediaMessage(targetMsg, 'buffer', {});
        const isTikTok = cmd === 'stickert' || cmd === 'stt';
        const processed = isTikTok ? await sharp(media).rotate().trim({ threshold: 16 }).toBuffer() : media;
        const webp = await toStickerWebp(processed, args.includes('recorte'));
        await sock.sendMessage(remoteJid, { sticker: webp }, { quoted: msg });
      } else if (cmd === 'ttp' && argsText) {
        const webp = await textToSticker(argsText);
        await sock.sendMessage(remoteJid, { sticker: webp }, { quoted: msg });
      } else if (cmd === 'qr' && argsText) {
        const png = await QRCode.toBuffer(argsText, { width: 512, margin: 2 });
        await sock.sendMessage(remoteJid, { image: png, caption: \`QR: \${argsText}\` }, { quoted: msg });
      } else if (cmd === 'ping') {
        await sock.sendMessage(remoteJid, { text: 'Pong! Bot activo.' }, { quoted: msg });
      } else if (cmd === 'dado') {
        const n = Math.floor(Math.random() * 6) + 1;
        await sock.sendMessage(remoteJid, { text: \`Salió un *\${n}*.\` }, { quoted: msg });
      } else if (cmd === 'moneda') {
        await sock.sendMessage(remoteJid, { text: Math.random() < 0.5 ? 'Cara' : 'Cruz' }, { quoted: msg });
      }
    }
  });
}

startBot();
`;

  const readme = `# ${config.botName} — Bot de WhatsApp

Generado desde la consola de FRAVEX.

## Instalación y ejecución local

1. Asegúrate de tener Node.js 20 o superior.
2. Instala las dependencias:
   \`\`\`bash
   npm install
   \`\`\`
3. Inicia el bot:
   \`\`\`bash
   npm start
   \`\`\`
4. Escanea el código QR en tu terminal desde **WhatsApp > Dispositivos vinculados**.

Prefijo configurado: \`${config.prefix}\`
Pack de stickers: ${config.stickerPack} (${config.stickerAuthor})
`;

  zip.file('package.json', JSON.stringify(packageJson, null, 2));
  zip.file('config.json', JSON.stringify(standaloneConfig, null, 2));
  zip.file('index.js', indexJs);
  zip.file('README.md', readme);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
