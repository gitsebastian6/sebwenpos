import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { AuthInterceptor } from "@/components/auth/auth-interceptor"
import { ErrorBoundary } from "@/components/shared/error-boundary"
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar"
import { PWAInstallPrompt } from "@/components/pwa/pwa-install-prompt"
import { PWASplashScreen } from "@/components/pwa/pwa-splash-screen"
import { QueryProvider } from "@/providers/query-provider"
// Global fetch interceptor — patches window.fetch to inject Bearer token on all /api/ requests.
// Must be imported early so it runs before any component's useEffect fires fetch calls.
// The module is SSR-safe (only patches in browser) and idempotent.
import "@/lib/auth-interceptor"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Ventify POS - Sistema de Punto de Venta Colombiano",
  description: "Sistema de punto de venta e inventario multi-tienda para Colombia. Facturación electrónica DIAN, gestión de inventario, reportes en tiempo real.",
  manifest: "/manifest.webmanifest",
  applicationName: "Ventify POS",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ventify POS",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#09090b",
    "msapplication-tap-highlight": "no",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AuthInterceptor />
          <QueryProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </QueryProvider>
          <Toaster richColors position="top-right" closeButton duration={5000} />
          <ServiceWorkerRegistrar />
          <PWAInstallPrompt />
        </ThemeProvider>
        <PWASplashScreen />
      </body>
    </html>
  )
}
