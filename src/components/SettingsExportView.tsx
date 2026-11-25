import { useState } from 'react';
import { Check, Download, Save } from 'lucide-react';
import { botApi } from '../lib/api';
import type { BotConfig } from '../types/bot';

interface SettingsExportViewProps {
  config: BotConfig;
  onConfigUpdated: (next: BotConfig) => void;
}

const PREFIX_OPTIONS = ['/', '!', '.', '#', '$', '?'];

export function SettingsExportView({ config, onConfigUpdated }: SettingsExportViewProps) {
  const [form, setForm] = useState({
    botName: config.botName,
    prefix: config.prefix,
    ownerName: config.ownerName,
    stickerPack: config.stickerPack,
    stickerAuthor: config.stickerAuthor,
    respondInGroups: config.respondInGroups,
    autoRead: config.autoRead,
    cooldownSeconds: config.cooldownSeconds,
    rulesText: config.rulesText,
  });

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSavedNotice(false);
    try {
      const updated = await botApi.updateConfig(form);
      onConfigUpdated(updated);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleSave}
        className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="pb-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Identidad y comportamiento</h2>
          <p className="text-sm text-slate-500 mt-1">
            Personaliza el prefijo de comandos, los metadatos de tus stickers y las reglas de
            respuesta.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nombre del bot
            </label>
            <input
              type="text"
              required
              value={form.botName}
              onChange={(e) => setForm({ ...form, botName: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nombre del propietario / admin
            </label>
            <input
              type="text"
              required
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Prefijo de comandos
            </label>
            <div className="flex items-center gap-1.5">
              {PREFIX_OPTIONS.map((pref) => (
                <button
                  key={pref}
                  type="button"
                  onClick={() => setForm({ ...form, prefix: pref })}
                  className={`w-10 h-10 font-mono text-base font-semibold rounded-lg border transition-colors cursor-pointer ${
                    form.prefix === pref
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pref}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Tiempo mínimo entre comandos (segundos)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={form.cooldownSeconds}
              onChange={(e) =>
                setForm({ ...form, cooldownSeconds: Math.max(0, Number(e.target.value)) })
              }
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nombre del Pack de Stickers (EXIF)
            </label>
            <input
              type="text"
              value={form.stickerPack}
              onChange={(e) => setForm({ ...form, stickerPack: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Autor del Pack de Stickers
            </label>
            <input
              type="text"
              value={form.stickerAuthor}
              onChange={(e) => setForm({ ...form, stickerAuthor: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.respondInGroups}
              onChange={(e) => setForm({ ...form, respondInGroups: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Responder comandos dentro de grupos de WhatsApp</span>
          </label>

          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoRead}
              onChange={(e) => setForm({ ...form, autoRead: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Marcar como leídos los mensajes que activan un comando</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Texto para el comando {form.prefix}reglas
          </label>
          <textarea
            rows={4}
            value={form.rulesText}
            onChange={(e) => setForm({ ...form, rulesText: e.target.value })}
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between gap-4">
          {savedNotice ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check className="w-4 h-4" />
              <span>Cambios guardados</span>
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Se aplica inmediatamente tanto en el simulador como en WhatsApp.
            </span>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar configuración'}</span>
          </button>
        </div>
      </form>

      {/* Export standalone bot package */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">
          Exportar proyecto Node.js
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          Descarga el código fuente completo de tu bot listo para ejecutarlo en tu computadora o
          servidor VPS con toda tu configuración actual y tus comandos personalizados.
        </p>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-700 space-y-1">
          <div>npm install</div>
          <div>npm start</div>
        </div>

        <a
          href="/api/bot/export"
          download="wabot-whatsapp-nodejs.zip"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Descargar bot (.zip)</span>
        </a>
      </div>
    </div>
  );
}
