'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { useAiChat, useAiChatClear } from '@/hooks/api/use-ai-chat'
import { Button } from '@/components/ui/button'
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  RotateCcw,
  ChevronDown,
  Zap,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// VivaPOS — AI Assistant (Production Chat Widget)
// ---------------------------------------------------------------------------
// Uses TanStack Query (useMutation) for API calls — consistent with the rest
// of the app. Includes: session management, context-aware quick actions,
// markdown rendering, usage tracking, mobile responsive, error recovery.
// ---------------------------------------------------------------------------

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ChatState {
  messages: ChatMessage[]
  sessionId: string | null
  usedToday: number | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'viva-chat-history'
const MAX_STORED_MESSAGES = 50

// ─── Context-Aware Quick Actions ───────────────────────────────────────────

interface QuickAction {
  label: string
  icon: string
  prompt: string
  views?: string[]
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: '¿Cómo vendo?', icon: '🛒', prompt: '¿Cómo hago una venta en el POS?', views: ['dashboard', 'pos'] },
  { label: 'Facturación DIAN', icon: '🧾', prompt: '¿Cómo configuro la facturación electrónica con la DIAN?', views: ['dashboard', 'invoices', 'settings'] },
  { label: 'Ver suscripción', icon: '📋', prompt: '¿Cómo veo o cambio mi plan de suscripción?', views: ['dashboard', 'settings'] },
  { label: 'Inventario', icon: '📦', prompt: '¿Cómo manejo el inventario y las alertas de stock mínimo?', views: ['dashboard', 'inventory', 'products'] },
  { label: 'Caja registradora', icon: '💰', prompt: '¿Cómo abro y cierro la caja registradora?', views: ['accounting', 'dashboard'] },
  { label: 'Crear cotización', icon: '📄', prompt: '¿Cómo creo una cotización para un cliente?', views: ['quotations', 'dashboard'] },
  { label: 'Agregar producto', icon: '➕', prompt: '¿Cómo agrego un nuevo producto al inventario?', views: ['products', 'inventory'] },
  { label: 'Mesas y comandas', icon: '🍽️', prompt: '¿Cómo uso las mesas y las comandas?', views: ['tables', 'dashboard'] },
  { label: 'Empleados y roles', icon: '👨‍💼', prompt: '¿Cómo configuro empleados y permisos?', views: ['employees', 'roles'] },
  { label: 'Compras a proveedores', icon: '🚚', prompt: '¿Cómo registro una compra a proveedor?', views: ['purchases', 'providers'] },
  { label: 'Reportes', icon: '📊', prompt: '¿Qué reportes puedo generar y cómo los exporto?', views: ['reports'] },
  { label: 'Nota crédito', icon: '↩️', prompt: '¿Cómo creo una nota crédito para una factura?', views: ['invoices'] },
]

// ─── LocalStorage Persistence ───────────────────────────────────────────────

function loadChatState(): ChatState | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.messages || !Array.isArray(parsed.messages)) return null
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    parsed.messages = parsed.messages.filter((m: ChatMessage) => m.timestamp > oneDayAgo)
    return parsed
  } catch {
    return null
  }
}

function saveChatState(state: ChatState) {
  try {
    if (typeof window === 'undefined') return
    const toSave = {
      ...state,
      messages: state.messages.slice(-MAX_STORED_MESSAGES),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch { /* ignore */ }
}

function clearChatState() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// ─── Simple Markdown Renderer ───────────────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs font-mono">$1</code>')
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="flex gap-1.5 ml-2"><span class="text-muted-foreground font-medium min-w-[1.25rem]">$1.</span><span>$2</span></div>')
  html = html.replace(/^[-*]\s+(.+)$/gm, '<div class="flex gap-1.5 ml-2"><span class="text-emerald-500 mt-0.5">•</span><span>$1</span></div>')
  html = html.replace(/\n\n/g, '</p><p class="mt-2">')
  html = html.replace(/\n/g, '<br />')
  html = `<p>${html}</p>`
  html = html.replace(/<p>\s*<\/p>/g, '')
  return html
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AiAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = loadChatState()
    return saved?.messages ?? []
  })
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = loadChatState()
    return saved?.sessionId ?? null
  })
  const [usedToday, setUsedToday] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = loadChatState()
    return saved?.usedToday ?? null
  })
  const [open, setOpen] = useState(false)
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentView = useAppStore((s) => s.currentView)
  const { user, subscription } = useAuthStore()

  // ── TanStack Query mutations ──
  const chatMutation = useAiChat()
  const clearMutation = useAiChatClear()

  const isLoading = chatMutation.isPending
  const error = chatMutation.error?.message || null

  // ── Initialize from localStorage ──
  // State is initialized from localStorage via useState initializers above.
  // No effect needed — this avoids the lint warning about setState in effects.

  // ── Save to localStorage on changes ──
  useEffect(() => {
    if (messages.length > 0) {
      saveChatState({ messages, sessionId, usedToday })
    }
  }, [messages, sessionId, usedToday])

  // ── Auto-scroll ──
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  // ── Focus input on open ──
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // ── Handle scroll position ──
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setShowScrollBottom(!isNearBottom)
  }, [])

  // ── Get context-aware quick actions ──
  const contextActions = QUICK_ACTIONS.filter(
    (a) => !a.views || a.views.includes(currentView),
  ).slice(0, 6)

  // ── Send message via TanStack Query ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')

    chatMutation.mutate(
      {
        message: text.trim(),
        sessionId,
        currentPage: currentView,
        subscriptionStatus: subscription?.subscriptionStatus,
        planName: subscription?.planName,
      },
      {
        onSuccess: (data) => {
          if (data.success && data.message) {
            const aiMessage: ChatMessage = {
              id: `msg-${Date.now()}-a`,
              role: 'assistant',
              content: data.message,
              timestamp: Date.now(),
            }
            setMessages(prev => [...prev, aiMessage])
            if (data.sessionId) setSessionId(data.sessionId)
            if (data.usage) setUsedToday(data.usage.usedToday)
          }
        },
      }
    )
  }, [isLoading, sessionId, currentView, subscription, chatMutation])

  // ── Clear chat via TanStack Query ──
  const clearChat = useCallback(async () => {
    if (sessionId) {
      clearMutation.mutate(sessionId)
    }
    setMessages([])
    setSessionId(null)
    setUsedToday(null)
    clearChatState()
  }, [sessionId, clearMutation])

  // ── Retry last message ──
  const retryLast = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      // Remove last AI message or error
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' || last?.role === 'user') {
          return prev.slice(0, -1)
        }
        return prev
      })
      sendMessage(lastUserMsg.content)
    }
  }, [messages, sendMessage])

  // ── Keyboard handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── Usage indicator (informational only — no limits) ──
  const usedTodayK = usedToday !== null ? Math.round(usedToday / 1000) : null

  return (
    <>
      {/* ── Floating Bubble Button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-all duration-300 hover:bg-emerald-700 hover:shadow-xl hover:scale-105 active:scale-95"
          aria-label="Abrir asistente Viva"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500" />
          </span>
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 flex h-full w-full flex-col bg-card sm:bottom-6 sm:right-6 sm:h-[600px] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl">
          {/* ── Header ── */}
          <div className="flex items-center justify-between bg-emerald-600 px-4 py-3 text-white sm:rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Viva</h3>
                <p className="text-[10px] text-emerald-100">Asistente Virtual</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {usedTodayK !== null && (
                <Tooltip label={`${usedTodayK}K tokens usados hoy`}>
                  <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-100">
                    <Zap className="h-3 w-3" />
                    {usedTodayK}K
                  </div>
                </Tooltip>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                className="h-7 w-7 text-emerald-100 hover:text-white hover:bg-emerald-700"
                title="Limpiar chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-7 w-7 text-emerald-100 hover:text-white hover:bg-emerald-700"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Messages Area ── */}
          <div className="relative flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto p-3" ref={scrollAreaRef} onScroll={handleScroll}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
                    <Bot className="h-7 w-7 text-emerald-600" />
                  </div>
                  <h4 className="mb-1 text-sm font-semibold text-foreground">
                    ¡Hola{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}! Soy Viva 👋
                  </h4>
                  <p className="mb-4 text-xs text-muted-foreground max-w-[260px]">
                    Tu asistente para VivaPOS. Pregúntame cómo usar cualquier función del sistema.
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-[320px]">
                    {contextActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.prompt)}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-accent hover:border-emerald-500/30"
                      >
                        <span className="text-base">{action.icon}</span>
                        <span className="font-medium leading-tight">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pb-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <User className="h-3.5 w-3.5" />
                        ) : (
                          <Bot className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div
                        className={`max-w-[300px] rounded-2xl px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div
                            className="whitespace-pre-wrap break-words leading-relaxed prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground [&_em]:text-foreground/80 [&_code]:text-emerald-600 dark:[&_code]:text-emerald-400 [&_br]:leading-4"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                          />
                        ) : (
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                        <div className="flex gap-1.5">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:0ms]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}
                  {error && !isLoading && (
                    <div className="mx-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20 px-3 py-2">
                      <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                      <button
                        onClick={retryLast}
                        className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-red-700 dark:text-red-300 hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reintentar
                      </button>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Scroll to bottom button */}
            {showScrollBottom && messages.length > 3 && (
              <button
                onClick={() => scrollToBottom()}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-background border border-border shadow-sm hover:bg-accent transition-colors"
                aria-label="Ir al final"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* ── Input Area ── */}
          <div className="border-t border-border p-3">
            {currentView && currentView !== 'dashboard' && (
              <div className="mb-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  📍 {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  — contexto activo
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu pregunta..."
                disabled={isLoading}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 transition-colors"
                maxLength={2000}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-9 w-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                aria-label="Enviar mensaje"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Viva puede cometer errores. Verifica la información importante.
              </p>
              {messages.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {messages.length} mensaje{messages.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Simple Tooltip ─────────────────────────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground text-background px-2 py-1 text-[10px] z-50">
          {label}
        </div>
      )}
    </div>
  )
}
