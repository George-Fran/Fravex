import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  addCustomCommand,
  loadBotConfig,
  saveBotConfig,
} from './server/botConfig.ts';
import { executeCommand } from './server/commandEngine.ts';
import { buildStandaloneBotZip } from './server/exportBuilder.ts';
import { whatsappManager } from './server/whatsappManager.ts';
import type { BotConfig, SimulatedReply } from './src/types/bot.ts';

const PORT = 3000;
process.env.TZ = 'America/Lima';

function decodeImageDataUrl(dataUrl?: string): Buffer | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) {
    throw new Error('La imagen supera el límite de 6 MB.');
  }
  return buf;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Bot status & activity logs
  app.get('/api/bot/status', (_req, res) => {
    res.json(whatsappManager.getStatus());
  });

  // Read config
  app.get('/api/bot/config', (_req, res) => {
    res.json(loadBotConfig());
  });

  // Update general config
  app.put('/api/bot/config', (req, res) => {
    try {
      const current = loadBotConfig();
      const body = req.body as Partial<BotConfig>;
      const updated = saveBotConfig({
        ...current,
        botName: typeof body.botName === 'string' ? body.botName : current.botName,
        prefix: typeof body.prefix === 'string' ? body.prefix : current.prefix,
        ownerName: typeof body.ownerName === 'string' ? body.ownerName : current.ownerName,
        stickerPack: typeof body.stickerPack === 'string' ? body.stickerPack : current.stickerPack,
        stickerAuthor:
          typeof body.stickerAuthor === 'string' ? body.stickerAuthor : current.stickerAuthor,
        respondInGroups:
          typeof body.respondInGroups === 'boolean'
            ? body.respondInGroups
            : current.respondInGroups,
        autoRead: typeof body.autoRead === 'boolean' ? body.autoRead : current.autoRead,
        cooldownSeconds:
          typeof body.cooldownSeconds === 'number'
            ? body.cooldownSeconds
            : current.cooldownSeconds,
        rulesText: typeof body.rulesText === 'string' ? body.rulesText : current.rulesText,
      });
      res.json(updated);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'No se pudo guardar la configuración.',
      });
    }
  });

  // Toggle built-in command settings
  app.patch('/api/bot/commands/builtin/:id', (req, res) => {
    const config = loadBotConfig();
    const { id } = req.params;
    const { enabled, adminOnly } = req.body as { enabled?: boolean; adminOnly?: boolean };

    let found = false;
    const nextBuiltIns = config.builtInCommands.map((cmd) => {
      if (cmd.id !== id) return cmd;
      found = true;
      return {
        ...cmd,
        enabled: typeof enabled === 'boolean' ? enabled : cmd.enabled,
        adminOnly: typeof adminOnly === 'boolean' ? adminOnly : cmd.adminOnly,
      };
    });

    if (!found) {
      res.status(404).json({ error: 'Comando no encontrado.' });
      return;
    }

    const updated = saveBotConfig({ ...config, builtInCommands: nextBuiltIns });
    res.json(updated);
  });

  // Create custom command
  app.post('/api/bot/commands/custom', (req, res) => {
    try {
      const config = loadBotConfig();
      const { trigger, description, response, adminOnly } = req.body as {
        trigger?: string;
        description?: string;
        response?: string;
        adminOnly?: boolean;
      };
      const result = addCustomCommand(config, {
        trigger: trigger ?? '',
        description: description ?? '',
        response: response ?? '',
        adminOnly,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'No se pudo crear el comando.',
      });
    }
  });

  // Toggle or edit custom command
  app.patch('/api/bot/commands/custom/:id', (req, res) => {
    const config = loadBotConfig();
    const { id } = req.params;
    const { enabled, adminOnly, description, response } = req.body as {
      enabled?: boolean;
      adminOnly?: boolean;
      description?: string;
      response?: string;
    };

    let found = false;
    const nextCustom = config.customCommands.map((cmd) => {
      if (cmd.id !== id) return cmd;
      found = true;
      return {
        ...cmd,
        enabled: typeof enabled === 'boolean' ? enabled : cmd.enabled,
        adminOnly: typeof adminOnly === 'boolean' ? adminOnly : cmd.adminOnly,
        description:
          typeof description === 'string' && description.trim()
            ? description.trim().slice(0, 140)
            : cmd.description,
        response:
          typeof response === 'string' && response.trim()
            ? response.trim().slice(0, 2000)
            : cmd.response,
      };
    });

    if (!found) {
      res.status(404).json({ error: 'Comando personalizado no encontrado.' });
      return;
    }

    const updated = saveBotConfig({ ...config, customCommands: nextCustom });
    res.json(updated);
  });

  // Delete custom command
  app.delete('/api/bot/commands/custom/:id', (req, res) => {
    const config = loadBotConfig();
    const { id } = req.params;
    const nextCustom = config.customCommands.filter((cmd) => cmd.id !== id);
    if (nextCustom.length === config.customCommands.length) {
      res.status(404).json({ error: 'Comando personalizado no encontrado.' });
      return;
    }
    const updated = saveBotConfig({ ...config, customCommands: nextCustom });
    res.json(updated);
  });

  // WhatsApp connection controls
  app.post('/api/bot/connect', async (req, res) => {
    const { mode, phoneNumber } = (req.body ?? {}) as {
      mode?: 'qr' | 'pairing';
      phoneNumber?: string;
    };
    const status = await whatsappManager.connect(mode === 'pairing' ? 'pairing' : 'qr', phoneNumber);
    res.json(status);
  });

  app.post('/api/bot/disconnect', async (_req, res) => {
    const status = await whatsappManager.disconnect();
    res.json(status);
  });

  app.post('/api/bot/logout', async (_req, res) => {
    const status = await whatsappManager.logout();
    res.json(status);
  });

  // Interactive simulator endpoint using the exact same backend engine
  app.post('/api/bot/simulate', async (req, res) => {
    const startedAt = Date.now();
    try {
      const { text, senderName, isGroup, isAdmin, imageDataUrl, sampleAssetName } =
        (req.body ?? {}) as {
          text?: string;
          senderName?: string;
          isGroup?: boolean;
          isAdmin?: boolean;
          imageDataUrl?: string;
          sampleAssetName?: string;
        };

      const config = loadBotConfig();
      let imageBuffer = decodeImageDataUrl(imageDataUrl);

      // Allow simulator to load a whitelisted sample image from src/assets/images or public/assets/aistudio safely
      if (!imageBuffer && sampleAssetName) {
        const safeName = path.basename(sampleAssetName);
        const allowedDirs = [
          path.resolve(process.cwd(), 'src', 'assets', 'images'),
          path.resolve(process.cwd(), 'public', 'assets', 'aistudio'),
        ];
        for (const baseDir of allowedDirs) {
          const resolved = path.resolve(baseDir, safeName);
          if (resolved.startsWith(baseDir + path.sep) && fs.existsSync(resolved)) {
            imageBuffer = fs.readFileSync(resolved);
            break;
          }
        }
      }

      const outcome = await executeCommand({
        config,
        rawText: String(text ?? ''),
        source: 'simulator',
        targetJid: 'simulator@local',
        senderName: String(senderName || 'Franco').slice(0, 40),
        senderId: '5491100000000@s.whatsapp.net',
        isGroup: Boolean(isGroup),
        isAdmin: isAdmin !== false,
        groupName: 'Comunidad Prueba',
        groupParticipants: [
          '5491100000000@s.whatsapp.net',
          '5215500000001@s.whatsapp.net',
          '34600000002@s.whatsapp.net',
          '57300000003@s.whatsapp.net',
        ],
        groupAdminCount: 2,
        imageBuffer,
        uptimeSeconds: whatsappManager.getUptimeSeconds(),
      });

      const latencyMs = Math.max(1, Date.now() - startedAt);
      const replies: SimulatedReply[] = outcome.replies.map((r) => {
        if (r.type === 'sticker' && r.buffer) {
          return {
            type: 'sticker',
            mediaDataUrl: `data:image/webp;base64,${r.buffer.toString('base64')}`,
          };
        }
        if (r.type === 'image' && r.buffer) {
          return {
            type: 'image',
            mediaDataUrl: `data:image/jpeg;base64,${r.buffer.toString('base64')}`,
            caption: r.caption,
          };
        }
        if (r.type === 'video' && r.buffer) {
          const canInline = r.buffer.length <= 14 * 1024 * 1024;
          return {
            type: 'video',
            mediaDataUrl: canInline
              ? `data:video/mp4;base64,${r.buffer.toString('base64')}`
              : undefined,
            externalUrl: r.externalUrl,
            caption: r.caption,
          };
        }
        if (r.type === 'audio' && r.buffer) {
          const canInline = r.buffer.length <= 14 * 1024 * 1024;
          const mime = r.mimetype || 'audio/mpeg';
          return {
            type: 'audio',
            mediaDataUrl: canInline
              ? `data:${mime};base64,${r.buffer.toString('base64')}`
              : undefined,
            externalUrl: r.externalUrl,
            caption: r.caption,
          };
        }
        return {
          type: 'text',
          text: r.text,
          mentions: r.mentions,
        };
      });

      if (outcome.matched) {
        whatsappManager.incrementStats({
          commandExecuted: outcome.status === 'ok',
          stickerGenerated: outcome.stickerGenerated,
        });
        whatsappManager.recordLog({
          source: 'simulator',
          sender: String(senderName || 'Franco'),
          chatType: isGroup ? 'group' : 'private',
          command: outcome.commandUsed || String(text ?? '').split(/\s+/)[0],
          status: outcome.status,
          detail: outcome.detail,
          latencyMs,
        });
      }

      res.json({
        matched: outcome.matched,
        commandUsed: outcome.commandUsed,
        latencyMs,
        replies,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Error al simular comando.',
      });
    }
  });

  // Download standalone Node.js bot ZIP
  app.get('/api/bot/export', async (_req, res) => {
    try {
      const config = loadBotConfig();
      const zipBuffer = await buildStandaloneBotZip(config);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="fravex-bot-whatsapp.zip"');
      res.send(zipBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'No se pudo generar el archivo ZIP.',
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FRAVEX activo en http://localhost:${PORT}`);
  });
}

startServer();
