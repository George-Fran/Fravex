import type {
  BotConfig,
  CustomCommandConfig,
  SimulateResponse,
  WhatsAppStatusSnapshot,
} from '../types/bot';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Error en la solicitud');
  }
  return data as T;
}

export const botApi = {
  getStatus: () => requestJson<WhatsAppStatusSnapshot>('/api/bot/status'),
  getConfig: () => requestJson<BotConfig>('/api/bot/config'),
  updateConfig: (patch: Partial<BotConfig>) =>
    requestJson<BotConfig>('/api/bot/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  toggleBuiltInCommand: (id: string, patch: { enabled?: boolean; adminOnly?: boolean }) =>
    requestJson<BotConfig>(`/api/bot/commands/builtin/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  createCustomCommand: (input: {
    trigger: string;
    description: string;
    response: string;
    adminOnly?: boolean;
  }) =>
    requestJson<{ config: BotConfig; created: CustomCommandConfig }>('/api/bot/commands/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCustomCommand: (
    id: string,
    patch: { enabled?: boolean; adminOnly?: boolean; description?: string; response?: string }
  ) =>
    requestJson<BotConfig>(`/api/bot/commands/custom/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteCustomCommand: (id: string) =>
    requestJson<BotConfig>(`/api/bot/commands/custom/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  connectWhatsApp: (mode: 'qr' | 'pairing', phoneNumber?: string) =>
    requestJson<WhatsAppStatusSnapshot>('/api/bot/connect', {
      method: 'POST',
      body: JSON.stringify({ mode, phoneNumber }),
    }),
  disconnectWhatsApp: () =>
    requestJson<WhatsAppStatusSnapshot>('/api/bot/disconnect', { method: 'POST' }),
  logoutWhatsApp: () =>
    requestJson<WhatsAppStatusSnapshot>('/api/bot/logout', { method: 'POST' }),
  simulateCommand: (payload: {
    text: string;
    senderName?: string;
    isGroup?: boolean;
    isAdmin?: boolean;
    imageDataUrl?: string;
    sampleAssetName?: string;
  }) =>
    requestJson<SimulateResponse>('/api/bot/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
