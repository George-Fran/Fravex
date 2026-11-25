export type CommandCategory = 'stickers' | 'utilidades' | 'info' | 'grupos';

export interface BuiltInCommandConfig {
  id: string;
  trigger: string;
  aliases: string[];
  category: CommandCategory;
  description: string;
  usage: string;
  enabled: boolean;
  adminOnly: boolean;
  requiresImage?: boolean;
  groupOnly?: boolean;
}

export interface CustomCommandConfig {
  id: string;
  trigger: string;
  description: string;
  response: string;
  enabled: boolean;
  adminOnly: boolean;
  createdAt: string;
}

export interface BotConfig {
  botName: string;
  prefix: string;
  ownerName: string;
  stickerPack: string;
  stickerAuthor: string;
  respondInGroups: boolean;
  autoRead: boolean;
  cooldownSeconds: number;
  rulesText: string;
  builtInCommands: BuiltInCommandConfig[];
  customCommands: CustomCommandConfig[];
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'pairing_ready'
  | 'connected'
  | 'error';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  source: 'whatsapp' | 'simulator';
  sender: string;
  chatType: 'private' | 'group';
  command: string;
  status: 'ok' | 'ignored' | 'error';
  detail: string;
  latencyMs: number;
}

export interface FiredReminderNotice {
  id: string;
  message: string;
  senderName: string;
  firedAt: string;
}

export interface WhatsAppStatusSnapshot {
  state: ConnectionState;
  qrDataUrl: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  pushName: string | null;
  lastError: string | null;
  connectedAt: string | null;
  uptimeSeconds: number;
  stats: {
    commandsExecuted: number;
    stickersGenerated: number;
    customCommandsCount: number;
    activeCommandsCount: number;
  };
  logs: ActivityLogEntry[];
  firedReminders: FiredReminderNotice[];
}

export interface SimulatedReply {
  type: 'text' | 'sticker' | 'image' | 'video' | 'audio';
  text?: string;
  mediaDataUrl?: string;
  externalUrl?: string;
  caption?: string;
  mentions?: string[];
}

export interface SimulateResponse {
  matched: boolean;
  commandUsed: string | null;
  latencyMs: number;
  replies: SimulatedReply[];
}
