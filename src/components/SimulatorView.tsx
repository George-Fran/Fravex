import { useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Download,
  ImagePlus,
  Send,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { botApi } from '../lib/api';
import type { BotConfig, FiredReminderNotice } from '../types/bot';

interface SimulatorViewProps {
  config: BotConfig;
  firedReminders?: FiredReminderNotice[];
  initialDraftCommand?: string | null;
  onDraftConsumed?: () => void;
  onAfterExecute: () => void;
}

interface ChatBubble {
  id: string;
  sender: 'user' | 'bot';
  time: string;
  text?: string;
  imagePreviewUrl?: string;
  stickerDataUrl?: string;
  qrImageDataUrl?: string;
  videoDataUrl?: string;
  audioDataUrl?: string;
  externalUrl?: string;
  caption?: string;
  latencyMs?: number;
}

const SAMPLE_CAT_URL = '/src/assets/images/sticker_sample_cat_1795609177215.jpg';
const SAMPLE_CAT_FILENAME = 'sticker_sample_cat_1795609177215.jpg';
const SAMPLE_TIKTOK_URL = '/assets/aistudio/imagen_82e3f5ba.png';
const SAMPLE_TIKTOK_FILENAME = 'imagen_82e3f5ba.png';
const BOT_AVATAR_URL = '/src/assets/images/bot_avatar_1795609176920.jpg';

function formatNow(): string {
  return new Date().toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Safely renders basic WhatsApp formatting (*bold* and `code`) into React elements without innerHTML.
 */
function FormattedWhatsAppText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate-900 break-words">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-2" />;
        }
        const segments = line.split(/(\*[^*]+\*|`[^`]+`)/g);
        return (
          <p key={lineIdx}>
            {segments.map((seg, segIdx) => {
              if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
                return (
                  <strong key={segIdx} className="font-semibold text-slate-950">
                    {seg.slice(1, -1)}
                  </strong>
                );
              }
              if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
                return (
                  <code
                    key={segIdx}
                    className="px-1.5 py-0.5 mx-0.5 bg-slate-200/70 rounded font-mono text-xs text-slate-900"
                  >
                    {seg.slice(1, -1)}
                  </code>
                );
              }
              return <span key={segIdx}>{seg}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function SimulatorView({
  config,
  firedReminders = [],
  initialDraftCommand,
  onDraftConsumed,
  onAfterExecute,
}: SimulatorViewProps) {
  const [messages, setMessages] = useState<ChatBubble[]>([
    {
      id: 'welcome',
      sender: 'bot',
      time: formatNow(),
      text: `Hola, soy *${config.botName}*. Prueba enviar *${config.prefix}menu*, adjuntar una foto con *${config.prefix}sticker*, enviar una captura de TikTok con *${config.prefix}stickert*, descargar reels con *${config.prefix}tiktok* / *${config.prefix}ig*, o programar alertas con *${config.prefix}recordar*.`,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [chatMode, setChatMode] = useState<'private' | 'group-admin' | 'group-member'>('private');
  const [attachedImageDataUrl, setAttachedImageDataUrl] = useState<string | null>(null);
  const [sampleKind, setSampleKind] = useState<'cat' | 'tiktok' | null>(null);
  const [sending, setSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const seenReminderIdsRef = useRef<Set<string>>(
    new Set(firedReminders.map((r) => r.id))
  );

  useEffect(() => {
    const incoming = firedReminders.filter((r) => !seenReminderIdsRef.current.has(r.id));
    if (incoming.length === 0) return;
    for (const r of incoming) {
      seenReminderIdsRef.current.add(r.id);
    }
    setMessages((prev) => [
      ...prev,
      ...incoming.map((r) => ({
        id: `rem-${r.id}`,
        sender: 'bot' as const,
        time: new Date(r.firedAt).toLocaleTimeString('es-PE', {
          timeZone: 'America/Lima',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        text: `*Recordatorio*\n${r.message}`,
      })),
    ]);
  }, [firedReminders]);

  useEffect(() => {
    if (initialDraftCommand) {
      const normalized = initialDraftCommand.replace(/^\//, config.prefix);
      const trigger = normalized.slice(config.prefix.length).split(/\s+/)[0]?.toLowerCase();
      if (['tagall', 'todos', 'mencionar', 'hidetag', 'aviso', 'grupo', 'groupinfo'].includes(trigger)) {
        setChatMode('group-admin');
      }
      if (['stickert', 'tiktoksticker', 'stikert', 'stt'].includes(trigger) && !attachedImageDataUrl) {
        setSampleKind('tiktok');
      } else if (['sticker', 's', 'stiker', 'pegatina'].includes(trigger) && !attachedImageDataUrl) {
        setSampleKind('cat');
      }
      setInputText(normalized);
      onDraftConsumed?.();
    }
  }, [initialDraftCommand, config.prefix, onDraftConsumed, attachedImageDataUrl]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleFileChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorBanner('Selecciona un archivo de imagen válido (PNG, JPG, WebP o GIF).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorBanner('La imagen es demasiado grande (máximo 5 MB).');
      return;
    }
    setErrorBanner(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachedImageDataUrl(reader.result);
        setSampleKind(null);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleAttachSampleCat() {
    setErrorBanner(null);
    setAttachedImageDataUrl(null);
    setSampleKind('cat');
    if (!inputText.trim() || inputText.startsWith(`${config.prefix}stickert`)) {
      setInputText(`${config.prefix}sticker`);
    }
  }

  function handleAttachSampleTikTok() {
    setErrorBanner(null);
    setAttachedImageDataUrl(null);
    setSampleKind('tiktok');
    setInputText(`${config.prefix}stickert`);
  }

  function clearAttachment() {
    setAttachedImageDataUrl(null);
    setSampleKind(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function sendCommand(overrideText?: string) {
    const textToSend = (overrideText ?? inputText).trim();
    if (!textToSend && !attachedImageDataUrl && !sampleKind) return;

    const trigger = textToSend.startsWith(config.prefix)
      ? textToSend.slice(config.prefix.length).split(/\s+/)[0]?.toLowerCase()
      : '';
    const isGroupQuickCmd = ['tagall', 'todos', 'mencionar', 'hidetag', 'aviso', 'grupo', 'groupinfo'].includes(trigger);
    const effectiveChatMode = isGroupQuickCmd && overrideText && chatMode === 'private' ? 'group-admin' : chatMode;
    if (effectiveChatMode !== chatMode) {
      setChatMode(effectiveChatMode);
    }

    const previewUrl =
      attachedImageDataUrl ??
      (sampleKind === 'tiktok'
        ? SAMPLE_TIKTOK_URL
        : sampleKind === 'cat'
          ? SAMPLE_CAT_URL
          : undefined);

    setErrorBanner(null);
    const userBubble: ChatBubble = {
      id: `u-${Date.now()}`,
      sender: 'user',
      time: formatNow(),
      text: textToSend || undefined,
      imagePreviewUrl: previewUrl,
    };

    setMessages((prev) => [...prev, userBubble]);
    if (!overrideText) setInputText('');

    const payloadImage = attachedImageDataUrl ?? undefined;
    const payloadSample =
      sampleKind === 'tiktok'
        ? SAMPLE_TIKTOK_FILENAME
        : sampleKind === 'cat'
          ? SAMPLE_CAT_FILENAME
          : undefined;
    clearAttachment();

    setSending(true);
    try {
      const res = await botApi.simulateCommand({
        text: textToSend,
        senderName: config.ownerName || 'Usuario',
        isGroup: effectiveChatMode !== 'private',
        isAdmin: effectiveChatMode === 'group-admin',
        imageDataUrl: payloadImage,
        sampleAssetName: payloadSample,
      });

      if (!res.matched) {
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: 'bot',
            time: formatNow(),
            text: `Los mensajes sin el prefijo *${config.prefix}* se ignoran automáticamente, igual que en WhatsApp real. Prueba *${config.prefix}menu*.`,
          },
        ]);
      } else {
        const botBubbles: ChatBubble[] = res.replies.map((reply, idx) => ({
          id: `b-${Date.now()}-${idx}`,
          sender: 'bot',
          time: formatNow(),
          text: reply.type === 'text' ? reply.text : undefined,
          stickerDataUrl: reply.type === 'sticker' ? reply.mediaDataUrl : undefined,
          qrImageDataUrl: reply.type === 'image' ? reply.mediaDataUrl : undefined,
          videoDataUrl: reply.type === 'video' ? reply.mediaDataUrl : undefined,
          audioDataUrl: reply.type === 'audio' ? reply.mediaDataUrl : undefined,
          externalUrl: reply.externalUrl,
          caption: reply.caption,
          latencyMs: idx === 0 ? res.latencyMs : undefined,
        }));
        setMessages((prev) => [...prev, ...botBubbles]);
        onAfterExecute();
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'No se pudo procesar el comando.');
    } finally {
      setSending(false);
    }
  }

  const quickCommands: Array<{ label: string; command: string }> = [
    { label: `${config.prefix}menu`, command: `${config.prefix}menu` },
    { label: `${config.prefix}ttp FRAVEX`, command: `${config.prefix}ttp FRAVEX` },
    { label: `${config.prefix}qr whatsapp.com`, command: `${config.prefix}qr https://whatsapp.com` },
    { label: `${config.prefix}clima Lima`, command: `${config.prefix}clima Lima` },
    { label: `${config.prefix}divisa 100 USD PEN`, command: `${config.prefix}divisa 100 USD PEN` },
    {
      label: `${config.prefix}recordar 10s`,
      command: `${config.prefix}recordar 10s Revisar mensaje`,
    },
    {
      label: `${config.prefix}tiktok (demo)`,
      command: `${config.prefix}tiktok https://www.tiktok.com/@tiktok/video/7106594312292453675`,
    },
    {
      label: `${config.prefix}ig (demo)`,
      command: `${config.prefix}ig https://www.instagram.com/reel/C85BZjeSHuO/`,
    },
    { label: `${config.prefix}tagall`, command: `${config.prefix}tagall Reunión hoy` },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main WhatsApp Simulator Window */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[680px]">
        {/* Chat header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
              <img
                src={BOT_AVATAR_URL}
                alt={config.botName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{config.botName}</div>
              <div className="text-xs text-slate-300 flex items-center gap-1.5">
                <span>Simulador en vivo</span>
                <span aria-hidden="true">·</span>
                <span>Prefijo {config.prefix}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setChatMode('private')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chatMode === 'private'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Privado</span>
              </button>
              <button
                type="button"
                onClick={() => setChatMode('group-admin')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chatMode === 'group-admin'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Grupo (Admin)</span>
              </button>
              <button
                type="button"
                onClick={() => setChatMode('group-member')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chatMode === 'group-member'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>Miembro</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'cleared',
                    sender: 'bot',
                    time: formatNow(),
                    text: `Chat reiniciado. Escribe *${config.prefix}menu* para comenzar.`,
                  },
                ])
              }
              title="Limpiar chat"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages thread */}
        <div className="flex-1 overflow-y-auto whatsapp-chat-bg p-5 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.stickerDataUrl ? (
                <div className="max-w-[260px] space-y-1.5">
                  <div className="p-2 rounded-xl bg-white/90 border border-slate-200/80 shadow-sm inline-block">
                    <img
                      src={msg.stickerDataUrl}
                      alt="Sticker WebP generado"
                      referrerPolicy="no-referrer"
                      className="w-44 h-44 object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-1 text-xs text-slate-600">
                    <span className="font-mono tabular-nums">
                      WebP 512x512 · {msg.time}
                    </span>
                    <a
                      href={msg.stickerDataUrl}
                      download={`sticker-${Date.now()}.webp`}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div
                  className={`max-w-[82%] rounded-xl px-3.5 py-2.5 shadow-sm border ${
                    msg.sender === 'user'
                      ? 'bg-[#d9fdd3] border-emerald-200/70'
                      : 'bg-white border-slate-200/80'
                  }`}
                >
                  {msg.imagePreviewUrl && (
                    <img
                      src={msg.imagePreviewUrl}
                      alt="Imagen adjunta"
                      referrerPolicy="no-referrer"
                      className="w-52 h-52 object-cover rounded-lg mb-2 border border-black/10"
                    />
                  )}
                  {msg.qrImageDataUrl && (
                    <div className="mb-2 space-y-2">
                      <img
                        src={msg.qrImageDataUrl}
                        alt="Imagen generada"
                        referrerPolicy="no-referrer"
                        className="w-52 h-52 object-contain rounded-lg border border-slate-200 bg-white p-1.5"
                      />
                      {msg.caption && <FormattedWhatsAppText text={msg.caption} />}
                    </div>
                  )}
                  {msg.audioDataUrl ? (
                    <div className="mb-2 space-y-2">
                      <audio
                        src={msg.audioDataUrl}
                        controls
                        className="w-64 max-w-full"
                      />
                      {msg.caption && <FormattedWhatsAppText text={msg.caption} />}
                      <a
                        href={msg.audioDataUrl}
                        download={`audio-${Date.now()}.mp3`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar audio MP3</span>
                      </a>
                    </div>
                  ) : (
                    (msg.videoDataUrl || msg.externalUrl) && (
                      <div className="mb-2 space-y-2">
                        {msg.videoDataUrl && (
                          <video
                            src={msg.videoDataUrl}
                            controls
                            playsInline
                            className="w-64 max-h-80 rounded-lg border border-slate-200 bg-black"
                          />
                        )}
                        {msg.caption && <FormattedWhatsAppText text={msg.caption} />}
                        <a
                          href={msg.videoDataUrl || msg.externalUrl}
                          download={`video-${Date.now()}.mp4`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar video MP4</span>
                        </a>
                      </div>
                    )
                  )}
                  {msg.text && <FormattedWhatsAppText text={msg.text} />}
                  <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                    {typeof msg.latencyMs === 'number' && <span>{msg.latencyMs} ms ·</span>}
                    <span>{msg.time}</span>
                    {msg.sender === 'user' && <CheckCheck className="w-3.5 h-3.5 text-sky-600" />}
                  </div>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-500">
                Procesando comando...
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Error & Attachment Preview */}
        {errorBanner && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{errorBanner}</span>
            <button type="button" onClick={() => setErrorBanner(null)} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {(attachedImageDataUrl || sampleKind) && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={
                  attachedImageDataUrl ??
                  (sampleKind === 'tiktok' ? SAMPLE_TIKTOK_URL : SAMPLE_CAT_URL)
                }
                alt="Vista previa adjunta"
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-md object-cover border border-slate-300"
              />
              <div className="text-xs">
                <div className="font-medium text-slate-900">
                  {sampleKind === 'tiktok'
                    ? 'Captura de TikTok lista'
                    : sampleKind === 'cat'
                      ? 'Foto de prueba lista'
                      : 'Imagen adjunta lista'}
                </div>
                <div className="text-slate-500">
                  Envía <code className="font-mono">{config.prefix}sticker</code> o{' '}
                  <code className="font-mono">{config.prefix}stickert</code>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCommand();
          }}
          className="p-3 bg-slate-100 border-t border-slate-200 flex items-center gap-2 shrink-0"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Subir imagen para /sticker"
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Escribe un comando (ej. ${config.prefix}menu o ${config.prefix}sticker)`}
            className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
          />

          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Enviar</span>
          </button>
        </form>
      </div>

      {/* Right Helper Panel: Sticker Tester & Quick Commands */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Probar /sticker y /stickert
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Convierte fotos normales con <code className="font-mono">{config.prefix}sticker</code> o
                capturas de TikTok con <code className="font-mono">{config.prefix}stickert</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 pt-1">
            <img
              src={SAMPLE_CAT_URL}
              alt="Gato con gafas de prueba"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
            />
            <div className="space-y-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={handleAttachSampleCat}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Probar {config.prefix}sticker</span>
              </button>
              <button
                type="button"
                onClick={handleAttachSampleTikTok}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Probar {config.prefix}stickert (TikTok)</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Subir mi propia captura</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Atajos de prueba</h3>
          <p className="text-xs text-slate-500">
            Haz clic en cualquier comando para enviarlo al simulador:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {quickCommands.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={sending}
                onClick={() => void sendCommand(item.command)}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-900 font-mono text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
