'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, X, Send, Bot, User, Sparkles, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// VentifyPOS — AI Assistant (Floating Chat)
// ---------------------------------------------------------------------------
// A VS Code Copilot-style chat bubble that provides contextual help.
// Uses the /api/ai/chat backend endpoint (GLM via z-ai-web-dev-sdk).
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const QUICK_ACTIONS = [
  { label: '¿Cómo vendo?', icon: '🛒', prompt: '¿Cómo hago una venta en el POS?' },
  { label: 'Facturación DIAN', icon: '🧾', prompt: '¿Cómo configuro la facturación electrónica con la DIAN?' },
  { label: 'Ver suscripción', icon: '📋', prompt: '¿Cómo veo o cambio mi plan de suscripción?' },
  { label: 'Inventario', icon: '📦', prompt: '¿Cómo manejo el inventario y las alertas de stock mínimo?' },
];

export function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Get current page context for smarter responses
  const getContext = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const path = window.location.pathname;
    const activeSection = document.querySelector('[data-section]')?.getAttribute('data-section');

    const contextParts: string[] = [];
    if (path) contextParts.push(`Página actual: ${path}`);
    if (activeSection) contextParts.push(`Sección activa: ${activeSection}`);
    return contextParts.join('\n');
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('auth_token') || '';

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          context: getContext(),
        }),
      });

      const data = await response.json();

      if (data.success && data.message) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.message, timestamp: Date.now() },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.error || 'Lo siento, no pude procesar tu pregunta. Intenta de nuevo.',
            timestamp: Date.now(),
          },
        ]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Error de conexión. Verifica tu internet e intenta de nuevo.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, getContext]);

  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  const clearChat = () => {
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* ── Floating Bubble Button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-all duration-300 hover:bg-emerald-700 hover:shadow-xl hover:scale-105 active:scale-95"
          aria-label="Abrir asistente Ventify"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500" />
          </span>
        </button>
      )}

      {/* ── Chat Panel ── */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] flex-col rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-4 sm:h-[560px] sm:w-[400px]">
          {/* ── Header ── */}
          <div className="flex items-center justify-between rounded-t-2xl bg-emerald-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <h3 className="text-sm font-semibold">Ventify</h3>
                <p className="text-[10px] text-emerald-100">Asistente Virtual</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 text-emerald-100 hover:text-white hover:bg-emerald-700"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Messages Area ── */}
          <ScrollArea className="flex-1 p-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
                  <Bot className="h-6 w-6 text-emerald-600" />
                </div>
                <h4 className="mb-1 text-sm font-semibold text-foreground">
                  ¡Hola! Soy Ventify 👋
                </h4>
                <p className="mb-4 text-xs text-muted-foreground">
                  Tu asistente para VentifyPOS. Pregúntame lo que quieras.
                </p>
                <div className="grid grid-cols-2 gap-2 w-full">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleQuickAction(action.prompt)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
                    >
                      <span className="text-base">{action.icon}</span>
                      <span className="font-medium">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
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
                      className={`max-w-[280px] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* ── Input Area ── */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu pregunta..."
                disabled={isLoading}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-9 w-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Ventify puede cometer errores. Verifica la información importante.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
