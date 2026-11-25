import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Command,
  Download,
  Menu,
  MessageSquare,
  Power,
  QrCode,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { CommandsView } from './components/CommandsView';
import { ConnectionView } from './components/ConnectionView';
import { SettingsExportView } from './components/SettingsExportView';
import { SimulatorView } from './components/SimulatorView';
import { botApi } from './lib/api';
import type { BotConfig, WhatsAppStatusSnapshot } from './types/bot';

type ActiveSection = 'connection' | 'simulator' | 'commands' | 'settings';

const BOT_AVATAR_URL = '/src/assets/images/bot_avatar_1795609176920.jpg';

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string }> = {
  connection: {
    title: 'Conexión WhatsApp',
    subtitle: 'Vincula tu cuenta por código QR o número y supervisa los mensajes entrantes',
  },
  simulator: {
    title: 'Simulador de Comandos',
    subtitle: 'Prueba /sticker, /ttp, /qr y el resto de comandos en tiempo real antes de conectar',
  },
  commands: {
    title: 'Catálogo de Comandos',
    subtitle: 'Activa comandos integrados, configura permisos y crea comandos personalizados',
  },
  settings: {
    title: 'Configuración y Exportar',
    subtitle: 'Ajusta el prefijo, metadatos de stickers y descarga el código fuente del bot',
  },
};

export default function App() {
  const [section, setSection] = useState<ActiveSection>('connection');
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [status, setStatus] = useState<WhatsAppStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [simulatorDraft, setSimulatorDraft] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await botApi.getStatus();
      setStatus(next);
    } catch {
      // Ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [cfg, st] = await Promise.all([botApi.getConfig(), botApi.getStatus()]);
        if (!cancelled) {
          setConfig(cfg);
          setStatus(st);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'No se pudo cargar la configuración del bot.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const intervalMs =
      status?.state === 'connecting' ||
      status?.state === 'qr_ready' ||
      status?.state === 'pairing_ready'
        ? 1500
        : 3500;
    const timer = setInterval(() => {
      void refreshStatus();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [refreshStatus, status?.state]);

  async function handleConnect(mode: 'qr' | 'pairing', phone?: string) {
    const next = await botApi.connectWhatsApp(mode, phone);
    setStatus(next);
  }

  async function handleDisconnect() {
    const next = await botApi.disconnectWhatsApp();
    setStatus(next);
  }

  async function handleLogout() {
    const next = await botApi.logoutWhatsApp();
    setStatus(next);
  }

  function handleTestInSimulator(commandExample: string) {
    setSimulatorDraft(commandExample);
    setSection('simulator');
    setMobileNavOpen(false);
  }

  const navItems: Array<{
    id: ActiveSection;
    label: string;
    icon: typeof QrCode;
    count?: number;
  }> = [
    { id: 'connection', label: 'Conexión WhatsApp', icon: QrCode },
    { id: 'simulator', label: 'Simulador en Vivo', icon: MessageSquare },
    {
      id: 'commands',
      label: 'Comandos',
      icon: Command,
      count: config
        ? config.builtInCommands.filter((c) => c.enabled).length +
          config.customCommands.filter((c) => c.enabled).length
        : undefined,
    },
    { id: 'settings', label: 'Ajustes y Exportar', icon: Settings },
  ];

  const connState = status?.state ?? 'disconnected';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
            <img
              src={BOT_AVATAR_URL}
              alt={config?.botName || 'FRAVEX'}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 truncate">
            {config?.botName || 'FRAVEX'}
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Prefijo activo</span>
            <code className="font-mono font-semibold text-slate-900">
              {config?.prefix ?? '/'}
            </code>
          </div>
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Stickers creados</span>
            <span className="font-mono text-slate-900 tabular-nums">
              {status?.stats.stickersGenerated ?? 0}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-slate-900 truncate">
                {config?.botName || 'FRAVEX'}
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                {SECTION_META[section].title}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate">
                {SECTION_META[section].subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-700 whitespace-nowrap">
              {connState === 'connected' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp conectado</span>
                </>
              ) : connState === 'connecting' ||
                connState === 'qr_ready' ||
                connState === 'pairing_ready' ? (
                <>
                  <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                  <span>Esperando vinculación</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 text-slate-400" />
                  <span>Sin vincular</span>
                </>
              )}
            </div>

            <a
              href="/api/bot/export"
              download="fravex-bot-whatsapp.zip"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Bot</span>
            </a>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1280px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : loadError || !config ? (
            <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
              {loadError || 'No se pudo inicializar la consola del bot.'}
            </div>
          ) : (
            <>
              {section === 'connection' && (
                <ConnectionView
                  status={status}
                  config={config}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onLogout={handleLogout}
                  onOpenSimulator={() => setSection('simulator')}
                />
              )}
              {section === 'simulator' && (
                <SimulatorView
                  config={config}
                  firedReminders={status?.firedReminders ?? []}
                  initialDraftCommand={simulatorDraft}
                  onDraftConsumed={() => setSimulatorDraft(null)}
                  onAfterExecute={() => void refreshStatus()}
                />
              )}
              {section === 'commands' && (
                <CommandsView
                  config={config}
                  onConfigUpdated={(next) => {
                    setConfig(next);
                    void refreshStatus();
                  }}
                  onTestInSimulator={handleTestInSimulator}
                />
              )}
              {section === 'settings' && (
                <SettingsExportView
                  config={config}
                  onConfigUpdated={(next) => {
                    setConfig(next);
                    void refreshStatus();
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
