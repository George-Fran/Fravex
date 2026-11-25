import fs from 'node:fs';
import path from 'node:path';
import type { FiredReminderNotice } from '../src/types/bot.ts';

export interface StoredReminder {
  id: string;
  source: 'whatsapp' | 'simulator';
  targetJid: string;
  senderId: string;
  senderName: string;
  message: string;
  dueAt: number;
  createdAt: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const REMINDERS_PATH = path.join(DATA_DIR, 'reminders.json');

type DeliveryCallback = (reminder: StoredReminder) => Promise<void> | void;

class ReminderService {
  private reminders: StoredReminder[] = [];
  private firedForSimulator: FiredReminderNotice[] = [];
  private timer: NodeJS.Timeout | null = null;
  private onDeliver: DeliveryCallback | null = null;
  private processing = false;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(REMINDERS_PATH)) {
        const raw = fs.readFileSync(REMINDERS_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.reminders = parsed;
        }
      }
    } catch {
      this.reminders = [];
    }
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(REMINDERS_PATH, JSON.stringify(this.reminders, null, 2), 'utf-8');
    } catch {
      // Ignore write failures
    }
  }

  public startScheduler(onDeliver: DeliveryCallback): void {
    this.onDeliver = onDeliver;
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.checkDue();
    }, 2000);
  }

  private async checkDue(): Promise<void> {
    if (this.processing || this.reminders.length === 0) return;
    this.processing = true;
    try {
      const now = Date.now();
      const due = this.reminders.filter((r) => r.dueAt <= now);
      if (due.length === 0) return;

      this.reminders = this.reminders.filter((r) => r.dueAt > now);
      this.saveToDisk();

      for (const item of due) {
        if (item.source === 'simulator') {
          this.firedForSimulator.push({
            id: item.id,
            message: item.message,
            senderName: item.senderName,
            firedAt: new Date().toISOString(),
          });
          if (this.firedForSimulator.length > 30) {
            this.firedForSimulator.shift();
          }
        }
        if (this.onDeliver) {
          await this.onDeliver(item);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  public getSimulatorNotices(): FiredReminderNotice[] {
    return [...this.firedForSimulator];
  }

  public addReminder(input: Omit<StoredReminder, 'id' | 'createdAt'>): StoredReminder {
    const item: StoredReminder = {
      ...input,
      id: Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 4),
      createdAt: Date.now(),
    };
    this.reminders.push(item);
    this.saveToDisk();
    return item;
  }

  public listForTarget(targetJid: string): StoredReminder[] {
    return this.reminders
      .filter((r) => r.targetJid === targetJid && r.dueAt > Date.now())
      .sort((a, b) => a.dueAt - b.dueAt);
  }

  public cancelForTarget(targetJid: string, idOrIndex: string): StoredReminder | null {
    const list = this.listForTarget(targetJid);
    let target: StoredReminder | undefined;
    const num = Number(idOrIndex);
    if (Number.isInteger(num) && num >= 1 && num <= list.length) {
      target = list[num - 1];
    } else {
      target = list.find((r) => r.id.toLowerCase() === idOrIndex.trim().toLowerCase());
    }
    if (!target) return null;
    this.reminders = this.reminders.filter((r) => r.id !== target!.id);
    this.saveToDisk();
    return target;
  }
}

export function parseDurationMs(token: string): { ms: number; label: string } | null {
  const cleaned = token.trim().toLowerCase();
  const compound = [...cleaned.matchAll(/(\d+)(d|h|m|min|s|seg)/g)];
  if (compound.length === 0 || compound.map((m) => m[0]).join('') !== cleaned) {
    return null;
  }

  let totalMs = 0;
  const parts: string[] = [];
  for (const m of compound) {
    const val = Number(m[1]);
    const unit = m[2];
    if (!Number.isFinite(val) || val <= 0) return null;
    if (unit === 's' || unit === 'seg') {
      totalMs += val * 1000;
      parts.push(`${val} s`);
    } else if (unit === 'm' || unit === 'min') {
      totalMs += val * 60_000;
      parts.push(`${val} min`);
    } else if (unit === 'h') {
      totalMs += val * 3_600_000;
      parts.push(`${val} h`);
    } else if (unit === 'd') {
      totalMs += val * 86_400_000;
      parts.push(`${val} d`);
    }
  }

  // Clamp between 5 seconds and 7 days
  if (totalMs < 5000 || totalMs > 7 * 86_400_000) {
    return null;
  }
  return { ms: totalMs, label: parts.join(' ') };
}

export const reminderService = new ReminderService();
