'use client'

import Image from 'next/image'
import { FEATURES_HIGHLIGHTS } from './auth-constants'

export function AuthHero() {
  return (
    <div className="relative overflow-hidden border-b border-zinc-800/40">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/[0.05] rounded-full blur-[140px]" />
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[250px] bg-purple-500/[0.03] rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[200px] bg-emerald-500/[0.02] rounded-full blur-[80px]" />
      </div>

      {/* Full-banner background watermark logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <Image
          src="/logo.png"
          alt=""
          fill
          className="object-contain opacity-[0.07] blur-[0.5px] scale-150 lg:scale-[2]"
          aria-hidden="true"
        />
      </div>

      {/* Scanline overlay */}
      <div className="scanline-overlay" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-14">
        <div className="flex flex-col items-center text-center relative">

          {/* Logo + Brand combined */}
          <div className="relative flex items-center justify-center gap-4 sm:gap-5 mb-5">

            {/* Main Logo - no square, big and clean */}
            <div className="relative glitch-logo-img">
              <Image
                src="/logo.png"
                alt="Ventify POS"
                width={120}
                height={120}
                className="object-contain drop-shadow-[0_0_30px_rgba(114,210,180,0.2)] sm:h-[140px] sm:w-auto lg:h-[160px] lg:w-auto"
                priority
              />
            </div>

            {/* Brand text */}
            <div className="relative">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-zinc-50 leading-none glitch-text">
                Ventify
              </h1>
              <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight mt-0.5">
                <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
                  POS
                </span>
              </p>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-sm sm:text-base text-zinc-400 max-w-lg mb-6 relative">
            El sistema de punto de venta que tu negocio merece
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 relative">
            {FEATURES_HIGHLIGHTS.map((f, i) => (
              <div
                key={f.label}
                className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-zinc-900/50 border border-zinc-800/40 hover:border-emerald-500/20 hover:bg-zinc-900/70 transition-all duration-300 group cursor-default"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <f.icon className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-xs font-bold text-zinc-200 leading-tight">{f.label}</span>
                  <span className="text-[10px] text-zinc-500 leading-tight">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
