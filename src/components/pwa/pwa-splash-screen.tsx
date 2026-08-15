'use client';

import { useEffect, useState } from 'react';

/**
 * PWASplashScreen — shown briefly when the app is launched from home screen.
 * Hides itself once the app content is ready (fonts loaded, SW registered).
 * Only visible in standalone mode (installed PWA).
 */
export function PWASplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Only show in standalone (installed PWA) mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (!isStandalone) return;

    setVisible(true);

    // Hide after app is ready (fonts + minimal delay for perceived performance)
    const hide = () => {
      setFading(true);
      setTimeout(() => setVisible(false), 400); // match animation duration
    };

    // Wait for fonts + a small delay so content is painted
    Promise.all([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 600)),
    ]).then(hide);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#09090b] transition-opacity duration-400 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Logo */}
      <div className="relative mb-6">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <img
            src="/logo.png"
            alt="Viva POS"
            className="h-14 w-14 object-contain"
          />
        </div>
      </div>

      {/* Brand */}
      <h1 className="text-xl font-bold text-white tracking-tight">
        Viva POS
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        Cargando sistema...
      </p>

      {/* Loading bar */}
      <div className="mt-8 h-1 w-32 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full w-full origin-left animate-[splash-load_1s_ease-out_forwards] rounded-full bg-primary" />
      </div>
    </div>
  );
}
