import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LogOut,
  Power,
  QrCode,
  RefreshCw,
  Smartphone,
  Terminal,
} from 'lucide-react';
import type { BotConfig, WhatsAppStatusSnapshot } from '../types/bot';

interface ConnectionViewProps {
  status: WhatsAppStatusSnapshot | null;
  config: BotConfig;
  onConnect: (mode: 'qr' | 'pairing', phone?: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenSimulator: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ConnectionView({
  status,
  config,
  onConnect,
  onDisconnect,
  onLogout,
  onOpenSimulator,
}: ConnectionViewProps) {
  const [linkMode, setLinkMode] = useState<'qr' | 'pairing'>('qr');
  const [phoneInput, setPhoneInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const state = status?.state ?? 'disconnected';

  async function handleStartConnection() {
    setErrorMsg(null);
    setBusy(true);
    try {
      await onConnect(linkMode, linkMode === 'pairing' ? phoneInput : undefined);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar la conexión');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onDisconnect();
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onLogout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Estado del motor</div>
          <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
            {state === 'connected' ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Conectado</span>
              </>
            ) : state === 'error' ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span>Con error</span>
              </>
            ) : state === 'qr_ready' || state === 'pairing_ready' || state === 'connecting' ? (
              <>
                <RefreshCw className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                <span>Vinculando</span>
              </>
            ) : (
              <>
                <Power className="w-5 h-5 text-slate-400 shrink-0" />
                <span>Desconectado</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Comandos activos</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums font-display">
            {status?.stats.activeCommandsCount ??
              config.builtInCommands.filter((c) => c.enabled).length +
                config.customCommands.filter((c) => c.enabled).length}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Comandos ejecutados</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums font-display">
            {status?.stats.commandsExecuted ?? 0}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Stickers creados</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums font-display">
            {status?.stats.stickersGenerated ?? 0}
          </div>
        </div>
      </div>

      {/* Main connection split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Vincular cuenta de WhatsApp
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Motor Baileys (protocolo WhatsApp Web Multidispositivo). Si el QR da error en tu
                  teléfono, usa la pestaña <strong className="font-medium text-slate-900">Por número</strong> para vincular con código de 8 dígitos.
                </p>
              </div>

              {state !== 'connected' && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setLinkMode('qr')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      linkMode === 'qr'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Código QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkMode('pairing')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      linkMode === 'pairing'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Por número
                  </button>
                </div>
              )}
            </div>

            {state === 'connected' ? (
              <div className="py-8 space-y-6">
                <div className="flex items-start gap-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-emerald-950">
                      Bot en línea y escuchando mensajes
                    </div>
                    <div className="text-sm text-emerald-800 flex flex-wrap items-center gap-2">
                      <span>Cuenta: {status?.pushName || config.botName}</span>
                      {status?.phoneNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">+{status.phoneNumber}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        Activo {formatDuration(status?.uptimeSeconds ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-600 space-y-2">
                  <p>
                    Envía <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-900">{config.prefix}menu</code> o una foto con{' '}
                    <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-900">{config.prefix}sticker</code> en cualquier chat (incluyendo tu chat propio) para probarlo en tiempo real.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-6 space-y-5">
                {linkMode === 'pairing' && (
                  <div>
                    <label
                      htmlFor="wa-phone-input"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      Número de WhatsApp (con código de país, sin + ni espacios)
                    </label>
                    <input
                      id="wa-phone-input"
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Ejemplo: 5491122334455 o 5215512345678"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 font-mono tabular-nums"
                    />
                  </div>
                )}

                {(errorMsg || status?.lastError) && (
                  <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMsg || status?.lastError}</span>
                  </div>
                )}

                <ol className="space-y-2.5 text-sm text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5 tabular-nums">
                      01.
                    </span>
                    <span>
                      Abre WhatsApp en tu teléfono y entra en{' '}
                      <strong className="font-medium text-slate-900">
                        Dispositivos vinculados
                      </strong>
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5 tabular-nums">
                      02.
                    </span>
                    <span>
                      Pulsa <strong className="font-medium text-slate-900">Vincular un dispositivo</strong>{' '}
                      y {linkMode === 'qr' ? 'escanea el código QR.' : 'elige vincular con número de teléfono.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5 tabular-nums">
                      03.
                    </span>
                    <span>
                      Una vez conectado, el bot responderá automáticamente al prefijo{' '}
                      <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-900">
                        {config.prefix}
                      </code>
                      .
                    </span>
                  </li>
                </ol>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
            {state === 'disconnected' || state === 'error' ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleStartConnection}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {linkMode === 'qr' ? <QrCode className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                <span>{busy ? 'Iniciando sesión...' : 'Generar vinculación'}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Power className="w-4 h-4" />
                  <span>Detener motor</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 hover:bg-red-50 text-red-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión guardada</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onOpenSimulator}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto"
            >
              <Terminal className="w-4 h-4" />
              <span>Probar en Simulador</span>
            </button>
          </div>
        </div>

        {/* Right QR / Pairing Preview Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center min-h-[320px]">
          {state === 'qr_ready' && status?.qrDataUrl ? (
            <div className="space-y-4">
              <img
                src={status.qrDataUrl}
                alt="Código QR para vincular WhatsApp"
                referrerPolicy="no-referrer"
                className="w-60 h-60 mx-auto rounded-lg border border-slate-200 p-2 bg-white"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Escanea este código QR
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Se renueva automáticamente si caduca antes de escanearse.
                </p>
              </div>
            </div>
          ) : state === 'pairing_ready' && status?.pairingCode ? (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Código de vinculación</div>
                <div className="mt-2 px-5 py-3 bg-slate-900 text-white font-mono text-2xl font-semibold tracking-widest rounded-lg tabular-nums">
                  {status.pairingCode}
                </div>
                <p className="text-xs text-slate-500 mt-3 max-w-xs mx-auto">
                  Introdúcelo en tu teléfono cuando WhatsApp solicite el código de 8 caracteres.
                </p>
              </div>
            </div>
          ) : state === 'connecting' ? (
            <div className="space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <div className="text-sm font-medium text-slate-900">
                Conectando con los servidores de WhatsApp...
              </div>
              <p className="text-xs text-slate-500 max-w-xs">
                Preparando la sesión cifrada multidispositivo. Esto toma unos segundos.
              </p>
            </div>
          ) : state === 'connected' ? (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Smartphone className="w-7 h-7" />
              </div>
              <div className="text-sm font-semibold text-slate-900">Dispositivo vinculado</div>
              <p className="text-xs text-slate-500 max-w-xs">
                Tu sesión está guardada localmente en el servidor. Todos los comandos activos se
                ejecutan automáticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <QrCode className="w-7 h-7" />
              </div>
              <div className="text-sm font-medium text-slate-900">
                Sin sesión activa
              </div>
              <p className="text-xs text-slate-500 max-w-xs">
                Pulsa «Generar vinculación» para mostrar el código QR, o prueba todos tus comandos
                ahora mismo en el Simulador.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Live Execution Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Registro reciente de comandos</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Historial en vivo tanto de WhatsApp como del simulador integrado
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {status?.logs.length ?? 0} registros
          </span>
        </div>

        {!status?.logs.length ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Aún no se ha ejecutado ningún comando. Prueba enviar{' '}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800">{config.prefix}menu</code>{' '}
            o{' '}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800">{config.prefix}sticker</code>{' '}
            desde el Simulador o desde WhatsApp.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-6">Hora</th>
                  <th className="py-2.5 px-4">Origen</th>
                  <th className="py-2.5 px-4">Usuario</th>
                  <th className="py-2.5 px-4">Comando</th>
                  <th className="py-2.5 px-4">Resultado</th>
                  <th className="py-2.5 px-6 text-right">Latencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {status.logs.slice(0, 15).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString('es-PE', {
                        timeZone: 'America/Lima',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      })}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {log.source === 'whatsapp' ? 'WhatsApp' : 'Simulador'} ·{' '}
                      {log.chatType === 'group' ? 'Grupo' : 'Privado'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-900 truncate max-w-[140px]">
                      {log.sender}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                      {log.command}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <span
                        className={
                          log.status === 'ok'
                            ? 'text-emerald-700 font-medium'
                            : log.status === 'error'
                              ? 'text-red-700 font-medium'
                              : 'text-slate-500'
                        }
                      >
                        {log.status === 'ok'
                          ? 'Correcto'
                          : log.status === 'error'
                            ? 'Error'
                            : 'Omitido'}
                      </span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-600">{log.detail}</span>
                    </td>
                    <td className="py-2.5 px-6 text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {log.latencyMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
