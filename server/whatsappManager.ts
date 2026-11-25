import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  extractMessageContent,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { loadBotConfig } from './botConfig.ts';
import { executeCommand } from './commandEngine.ts';
import { reminderService } from './reminderService.ts';
import type {
  ActivityLogEntry,
  ConnectionState,
  WhatsAppStatusSnapshot,
} from '../src/types/bot.ts';

const AUTH_DIR = path.resolve(process.cwd(), 'auth_info_baileys');
const logger = pino({ level: 'silent' });

class WhatsAppBotManager {
  private sock: WASocket | null = null;
  private state: ConnectionState = 'disconnected';
  private qrDataUrl: string | null = null;
  private pairingCode: string | null = null;
  private phoneNumber: string | null = null;
  private pushName: string | null = null;
  private lastError: string | null = null;
  private connectedAt: number | null = null;
  private manualStop = false;
  private pairingRequested = false;
  private commandsExecuted = 0;
  private stickersGenerated = 0;
  private logs: ActivityLogEntry[] = [];
  private cooldowns = new Map<string, number>();
  private sentMessageIds = new Set<string>();

  constructor() {
    reminderService.startScheduler(async (rem) => {
      if (rem.source === 'whatsapp' && this.sock && this.state === 'connected') {
        try {
          const isGroup = rem.targetJid.endsWith('@g.us');
          const mentionTag = isGroup ? `@${rem.senderId.split('@')[0]} ` : '';
          const sent = await this.sock.sendMessage(rem.targetJid, {
            text: `*Recordatorio*\n${mentionTag}${rem.message}`,
            ...(isGroup ? { mentions: [rem.senderId] } : {}),
          });
          if (sent?.key?.id) {
            this.sentMessageIds.add(sent.key.id);
          }
          this.recordLog({
            source: 'whatsapp',
            sender: rem.senderName,
            chatType: isGroup ? 'group' : 'private',
            command: '/recordar',
            status: 'ok',
            detail: 'Recordatorio enviado',
            latencyMs: 1,
          });
        } catch {
          // Ignore send failure
        }
      } else if (rem.source === 'simulator') {
        this.recordLog({
          source: 'simulator',
          sender: rem.senderName,
          chatType: 'private',
          command: '/recordar',
          status: 'ok',
          detail: 'Recordatorio disparado',
          latencyMs: 1,
        });
      }
    });
  }

  public recordLog(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): void {
    const item: ActivityLogEntry = {
      ...entry,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(item);
    if (this.logs.length > 50) {
      this.logs.length = 50;
    }
  }

  public incrementStats(opts: { commandExecuted?: boolean; stickerGenerated?: boolean }): void {
    if (opts.commandExecuted) this.commandsExecuted += 1;
    if (opts.stickerGenerated) this.stickersGenerated += 1;
  }

  public getUptimeSeconds(): number {
    if (!this.connectedAt) return Math.floor(process.uptime());
    return Math.floor((Date.now() - this.connectedAt) / 1000);
  }

  public getStatus(): WhatsAppStatusSnapshot {
    const cfg = loadBotConfig();
    const activeCommandsCount =
      cfg.builtInCommands.filter((c) => c.enabled).length +
      cfg.customCommands.filter((c) => c.enabled).length;

    return {
      state: this.state,
      qrDataUrl: this.qrDataUrl,
      pairingCode: this.pairingCode,
      phoneNumber: this.phoneNumber,
      pushName: this.pushName,
      lastError: this.lastError,
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
      uptimeSeconds: this.getUptimeSeconds(),
      stats: {
        commandsExecuted: this.commandsExecuted,
        stickersGenerated: this.stickersGenerated,
        customCommandsCount: cfg.customCommands.length,
        activeCommandsCount,
      },
      logs: this.logs,
      firedReminders: reminderService.getSimulatorNotices(),
    };
  }

  public async connect(mode: 'qr' | 'pairing' = 'qr', rawPhone?: string): Promise<WhatsAppStatusSnapshot> {
    if (this.sock && (this.state === 'connecting' || this.state === 'connected')) {
      return this.getStatus();
    }

    const sanitizedPhone = rawPhone ? rawPhone.replace(/\D/g, '') : '';
    if (mode === 'pairing' && sanitizedPhone.length < 8) {
      this.state = 'error';
      this.lastError = 'Ingresa un número de teléfono válido con código de país (sin + ni espacios).';
      return this.getStatus();
    }

    this.manualStop = false;
    this.pairingRequested = false;
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.lastError = null;
    this.state = 'connecting';

    try {
      if (fs.existsSync(AUTH_DIR)) {
        const credsPath = path.join(AUTH_DIR, 'creds.json');
        let isRegistered = false;
        if (fs.existsSync(credsPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf-8')) as {
              registered?: boolean;
            };
            isRegistered = Boolean(parsed.registered);
          } catch {
            isRegistered = false;
          }
        }
        if (!isRegistered) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
      }

      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      let version: [number, number, number] | undefined;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
      } catch {
        version = undefined;
      }

      const cfg = loadBotConfig();
      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        qrTimeout: 45_000,
      });

      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        if (this.sock !== sock) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (mode === 'pairing' && !state.creds.registered && sanitizedPhone) {
            if (!this.pairingRequested) {
              this.pairingRequested = true;
              try {
                const code = await sock.requestPairingCode(sanitizedPhone);
                this.pairingCode = code.match(/.{1,4}/g)?.join('-') ?? code;
                this.state = 'pairing_ready';
                this.lastError = null;
              } catch (err) {
                this.state = 'error';
                this.lastError =
                  err instanceof Error
                    ? `No se pudo generar el código de vinculación: ${err.message}`
                    : 'Error al solicitar el código de vinculación.';
              }
            }
          } else {
            try {
              this.qrDataUrl = await QRCode.toDataURL(qr, {
                width: 300,
                margin: 2,
                color: { dark: '#0f172a', light: '#ffffff' },
              });
              this.state = 'qr_ready';
              this.lastError = null;
            } catch {
              this.lastError = 'No se pudo renderizar el código QR.';
            }
          }
        }

        if (connection === 'open') {
          this.state = 'connected';
          this.qrDataUrl = null;
          this.pairingCode = null;
          this.lastError = null;
          this.connectedAt = Date.now();
          const meId = sock.user?.id ?? '';
          this.phoneNumber = meId.split(':')[0]?.split('@')[0] || null;
          this.pushName = sock.user?.name || cfg.botName;
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
            ?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const restartRequired = statusCode === DisconnectReason.restartRequired;

          this.sock = null;
          this.qrDataUrl = null;
          this.pairingCode = null;

          if (this.manualStop) {
            this.state = 'disconnected';
            this.connectedAt = null;
            return;
          }

          if (loggedOut) {
            this.state = 'disconnected';
            this.connectedAt = null;
            this.phoneNumber = null;
            this.pushName = null;
            this.lastError = 'La sesión fue cerrada desde WhatsApp. Vuelve a vincular el dispositivo.';
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            return;
          }

          this.state = 'connecting';
          setTimeout(
            () => {
              if (!this.manualStop) {
                void this.connect(mode, sanitizedPhone || undefined);
              }
            },
            restartRequired ? 400 : 2500
          );
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || this.sock !== sock) return;
        for (const msg of messages) {
          await this.handleIncomingMessage(sock, msg);
        }
      });
    } catch (err) {
      this.state = 'error';
      this.lastError =
        err instanceof Error ? err.message : 'Error inesperado al iniciar el cliente de WhatsApp.';
    }

    return this.getStatus();
  }

  private async handleIncomingMessage(sock: WASocket, msg: WAMessage): Promise<void> {
    try {
      const msgId = msg.key.id;
      if (msgId && this.sentMessageIds.has(msgId)) {
        return;
      }

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const content = extractMessageContent(msg.message);
      if (!content) return;

      const text =
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        '';

      const config = loadBotConfig();
      if (!text.startsWith(config.prefix)) return;

      const isGroup = remoteJid.endsWith('@g.us');
      if (isGroup && !config.respondInGroups) return;

      const senderJid = msg.key.participant || remoteJid;
      const now = Date.now();
      const lastHit = this.cooldowns.get(senderJid) ?? 0;
      if (config.cooldownSeconds > 0 && now - lastHit < config.cooldownSeconds * 1000) {
        return;
      }
      this.cooldowns.set(senderJid, now);

      if (config.autoRead && !msg.key.fromMe) {
        await sock.readMessages([msg.key]).catch(() => undefined);
      }

      let isAdmin = Boolean(msg.key.fromMe);
      let groupName: string | undefined;
      let groupParticipants: string[] | undefined;
      let groupAdminCount: number | undefined;

      if (isGroup) {
        try {
          const meta = await sock.groupMetadata(remoteJid);
          groupName = meta.subject;
          groupParticipants = meta.participants.map((p) => p.id);
          const admins = meta.participants.filter(
            (p) => p.admin === 'admin' || p.admin === 'superadmin'
          );
          groupAdminCount = admins.length;
          if (!isAdmin) {
            isAdmin = admins.some((a) => a.id === senderJid);
          }
        } catch {
          // Ignore metadata failure
        }
      }

      // Extract direct image or quoted image if present
      let imageBuffer: Buffer | null = null;
      const quotedImg = content.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      const targetImageMsg: WAMessage | null = content.imageMessage
        ? msg
        : quotedImg
          ? ({
              key: msg.key,
              message: { imageMessage: quotedImg },
            } as WAMessage)
          : null;

      if (targetImageMsg) {
        try {
          imageBuffer = await downloadMediaMessage(
            targetImageMsg,
            'buffer',
            {},
            {
              reuploadRequest: sock.updateMediaMessage,
              logger,
            }
          );
        } catch {
          imageBuffer = null;
        }
      }

      const startedAt = Date.now();
      const outcome = await executeCommand({
        config,
        rawText: text,
        source: 'whatsapp',
        targetJid: remoteJid,
        senderName: msg.pushName || senderJid.split('@')[0] || 'Usuario',
        senderId: senderJid,
        isGroup,
        isAdmin,
        groupName,
        groupParticipants,
        groupAdminCount,
        imageBuffer,
        uptimeSeconds: this.getUptimeSeconds(),
      });

      if (!outcome.matched) return;

      for (const reply of outcome.replies) {
        let sent: WAMessage | undefined;
        if (reply.type === 'sticker' && reply.buffer) {
          sent = await sock.sendMessage(remoteJid, { sticker: reply.buffer }, { quoted: msg });
        } else if (reply.type === 'image' && reply.buffer) {
          sent = await sock.sendMessage(
            remoteJid,
            { image: reply.buffer, caption: reply.caption },
            { quoted: msg }
          );
        } else if (reply.type === 'video' && reply.buffer) {
          sent = await sock.sendMessage(
            remoteJid,
            { video: reply.buffer, caption: reply.caption },
            { quoted: msg }
          );
        } else if (reply.type === 'audio' && reply.buffer) {
          sent = await sock.sendMessage(
            remoteJid,
            {
              audio: reply.buffer,
              mimetype: reply.mimetype || 'audio/mpeg',
              ptt: false,
            },
            { quoted: msg }
          );
        } else if (reply.type === 'text' && reply.text) {
          sent = await sock.sendMessage(
            remoteJid,
            {
              text: reply.text,
              ...(reply.mentions?.length ? { mentions: reply.mentions } : {}),
            },
            { quoted: msg }
          );
        }
        if (sent?.key?.id) {
          this.sentMessageIds.add(sent.key.id);
          if (this.sentMessageIds.size > 500) {
            const first = this.sentMessageIds.values().next().value;
            if (first) this.sentMessageIds.delete(first);
          }
        }
      }

      this.incrementStats({
        commandExecuted: outcome.status === 'ok',
        stickerGenerated: outcome.stickerGenerated,
      });

      this.recordLog({
        source: 'whatsapp',
        sender: msg.pushName || senderJid.split('@')[0] || 'WhatsApp',
        chatType: isGroup ? 'group' : 'private',
        command: outcome.commandUsed || text.split(/\s+/)[0],
        status: outcome.status,
        detail: outcome.detail,
        latencyMs: Math.max(1, Date.now() - startedAt),
      });
    } catch (err) {
      this.recordLog({
        source: 'whatsapp',
        sender: msg.pushName || 'WhatsApp',
        chatType: msg.key.remoteJid?.endsWith('@g.us') ? 'group' : 'private',
        command: 'error',
        status: 'error',
        detail: err instanceof Error ? err.message : 'Fallo interno',
        latencyMs: 0,
      });
    }
  }

  public async disconnect(): Promise<WhatsAppStatusSnapshot> {
    this.manualStop = true;
    try {
      this.sock?.end(undefined);
    } catch {
      // Ignore socket close error
    }
    this.sock = null;
    this.state = 'disconnected';
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.connectedAt = null;
    return this.getStatus();
  }

  public async logout(): Promise<WhatsAppStatusSnapshot> {
    this.manualStop = true;
    try {
      await this.sock?.logout();
    } catch {
      // Ignore logout failure if already closed
    }
    try {
      this.sock?.end(undefined);
    } catch {
      // Ignore
    }
    this.sock = null;
    this.state = 'disconnected';
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.phoneNumber = null;
    this.pushName = null;
    this.connectedAt = null;
    this.lastError = null;
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    return this.getStatus();
  }
}

export const whatsappManager = new WhatsAppBotManager();
