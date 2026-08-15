'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

// Extend Window for beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

/**
 * PWAInstallPrompt — captures the `beforeinstallprompt` event and shows
 * a custom "Install Viva POS" banner. Works on Android/Chrome.
 * On iOS Safari, shows a manual instructions tooltip instead.
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) return;

    // Check if previously dismissed
    const dismissedAt = localStorage.getItem('viva-install-dismissed');
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) return; // Don't show again for 7 days
    }

    // Detect iOS Safari (no beforeinstallprompt support)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!Chrome|Android).)*Safari/.test(navigator.userAgent);

    if (isIOS && isSafari) {
      // Show iOS install hint after 3 seconds
      const timer = setTimeout(() => setShowIOSHint(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: capture beforeinstallprompt
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner after a short delay so it doesn't feel intrusive
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      console.log('[PWA] App installed');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
      }

      setDeferredPrompt(null);
      setShowBanner(false);
    } catch (error) {
      console.error('[PWA] Install prompt error:', error);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIOSHint(false);
    setDismissed(true);
    localStorage.setItem('viva-install-dismissed', Date.now().toString());
  }, []);

  // Don't render if dismissed or not showing
  if (dismissed) return null;

  // ── iOS Safari hint ──
  if (showIOSHint) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md animate-in slide-in-from-bottom-5">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Instalar Viva POS</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Toca el icono <span className="inline-flex items-center mx-0.5 font-medium text-primary">↗ Compartir</span> en Safari y selecciona{' '}
              <span className="font-medium text-primary">&quot;Agregar a pantalla de inicio&quot;</span>
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-md p-1 hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  // ── Android/Chrome install banner ──
  if (!showBanner || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md animate-in slide-in-from-bottom-5">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Instalar Viva POS</p>
          <p className="text-xs text-muted-foreground">
            Acceso rápido desde tu pantalla de inicio, funciona sin conexión
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 hover:bg-accent transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
