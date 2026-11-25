import { useMemo, useState } from 'react';
import { Play, Plus, Search, Shield, Trash2, X } from 'lucide-react';
import { botApi } from '../lib/api';
import type { BotConfig, CommandCategory } from '../types/bot';

interface CommandsViewProps {
  config: BotConfig;
  onConfigUpdated: (next: BotConfig) => void;
  onTestInSimulator: (usage: string) => void;
}

type FilterTab = 'all' | CommandCategory | 'custom';

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  stickers: 'Stickers y Media',
  utilidades: 'Utilidades',
  info: 'Información en Vivo',
  grupos: 'Grupos',
};

export function CommandsView({
  config,
  onConfigUpdated,
  onTestInSimulator,
}: CommandsViewProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newTrigger, setNewTrigger] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [newAdminOnly, setNewAdminOnly] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const p = config.prefix;

  const filteredBuiltIns = useMemo(() => {
    if (filter === 'custom') return [];
    return config.builtInCommands.filter((cmd) => {
      if (filter !== 'all' && cmd.category !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        cmd.trigger.includes(q) ||
        cmd.aliases.some((a) => a.includes(q)) ||
        cmd.description.toLowerCase().includes(q)
      );
    });
  }, [config.builtInCommands, filter, search]);

  const filteredCustom = useMemo(() => {
    if (filter !== 'all' && filter !== 'custom') return [];
    return config.customCommands.filter((cmd) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        cmd.trigger.includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.response.toLowerCase().includes(q)
      );
    });
  }, [config.customCommands, filter, search]);

  async function handleToggleBuiltIn(id: string, enabled: boolean) {
    const next = await botApi.toggleBuiltInCommand(id, { enabled });
    onConfigUpdated(next);
  }

  async function handleToggleBuiltInAdmin(id: string, adminOnly: boolean) {
    const next = await botApi.toggleBuiltInCommand(id, { adminOnly });
    onConfigUpdated(next);
  }

  async function handleToggleCustom(id: string, enabled: boolean) {
    const next = await botApi.updateCustomCommand(id, { enabled });
    onConfigUpdated(next);
  }

  async function handleDeleteCustom(id: string) {
    const next = await botApi.deleteCustomCommand(id);
    onConfigUpdated(next);
  }

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setSaving(true);
    try {
      const { config: next } = await botApi.createCustomCommand({
        trigger: newTrigger,
        description: newDesc,
        response: newResponse,
        adminOnly: newAdminOnly,
      });
      onConfigUpdated(next);
      setShowCreateModal(false);
      setNewTrigger('');
      setNewDesc('');
      setNewResponse('');
      setNewAdminOnly(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo crear el comando');
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'stickers', label: 'Stickers y Media' },
    { id: 'utilidades', label: 'Utilidades' },
    { id: 'info', label: 'En vivo' },
    { id: 'grupos', label: 'Grupos' },
    { id: 'custom', label: 'Personalizados' },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar comando..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo comando</span>
          </button>
        </div>
      </div>

      {/* Custom Commands Section */}
      {filteredCustom.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Comandos personalizados</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Respuestas rápidas definidas por ti con soporte para variables dinámicas
              </p>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {filteredCustom.length} comandos
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredCustom.map((cmd) => (
              <div
                key={cmd.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-sm font-semibold text-slate-900">
                      {p}
                      {cmd.trigger}
                    </code>
                    <span className="text-xs text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-500">
                      {cmd.adminOnly ? 'Solo administradores' : 'Todos los usuarios'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 truncate">{cmd.response}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => onTestInSimulator(`${p}${cmd.trigger}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Probar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleCustom(cmd.id, !cmd.enabled)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      cmd.enabled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {cmd.enabled ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCustom(cmd.id)}
                    title="Eliminar comando"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in Commands Table */}
      {filter !== 'custom' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Comandos integrados</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Activa, restringe a administradores o prueba directamente cada comando
              </p>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {filteredBuiltIns.length} mostrados
            </span>
          </div>

          {filteredBuiltIns.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No hay comandos que coincidan con tu búsqueda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredBuiltIns.map((cmd) => {
                const formattedUsage = cmd.usage.replace(/^\//, p);
                return (
                  <div
                    key={cmd.id}
                    className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-sm font-semibold text-slate-900">
                          {p}
                          {cmd.trigger}
                        </code>
                        {cmd.aliases.length > 0 && (
                          <>
                            <span className="text-xs text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              alias: {cmd.aliases.map((a) => `${p}${a}`).join(', ')}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-500">
                          {CATEGORY_LABELS[cmd.category]}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{cmd.description}</p>
                      <div className="text-xs text-slate-500 font-mono">
                        Uso: {formattedUsage}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onTestInSimulator(formattedUsage.split(' [')[0])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Probar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleBuiltInAdmin(cmd.id, !cmd.adminOnly)}
                        title="Alternar restricción solo para administradores en grupos"
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                          cmd.adminOnly
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{cmd.adminOnly ? 'Solo admin' : 'Público'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleBuiltIn(cmd.id, !cmd.enabled)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                          cmd.enabled
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {cmd.enabled ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Custom Command Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Crear comando personalizado
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del comando (sin prefijo)
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg font-mono text-sm text-slate-600">
                    {p}
                  </span>
                  <input
                    type="text"
                    required
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    placeholder="precios"
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-r-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción breve (para {p}menu)
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Muestra el catálogo y lista de precios"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Respuesta del bot
                </label>
                <textarea
                  rows={4}
                  required
                  value={newResponse}
                  onChange={(e) => setNewResponse(e.target.value)}
                  placeholder="Hola {usuario}, aquí tienes nuestros precios actualizados al {fecha}..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Variables disponibles: <code className="font-mono">{'{usuario}'}</code>,{' '}
                  <code className="font-mono">{'{bot}'}</code>,{' '}
                  <code className="font-mono">{'{args}'}</code>,{' '}
                  <code className="font-mono">{'{fecha}'}</code>,{' '}
                  <code className="font-mono">{'{hora}'}</code>
                </p>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAdminOnly}
                  onChange={(e) => setNewAdminOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Permitir solo a administradores en grupos</span>
              </label>

              {createError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar comando'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
