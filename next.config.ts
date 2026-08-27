import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  allowedDevOrigins: [
    '.space-z.ai',
  ],
  // Prevent Turbopack from bundling server-only packages that use Node.js APIs
  serverExternalPackages: ['z-ai-web-dev-sdk'],
  compiler: {
    // Strip debug/info logs in production, keep error/warn for monitoring
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // TypeScript errors are caught in CI — no silent masking
  typescript: {
    ignoreBuildErrors: false,
  },
  // Exclude examples folder from build
  outputFileTracingExcludes: {
    '*': ['./examples/**'],
  },
  // Security headers on all responses
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking (allow preview origins)
          { key: "X-Frame-Options", value: process.env.NODE_ENV === 'development' ? 'ALLOWALL' : 'SAMEORIGIN' },
          // Enforce HTTPS
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent XSS (legacy browsers)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // CSP — frame-ancestors must match X-Frame-Options
          { key: "Content-Security-Policy", value: process.env.NODE_ENV === 'development' ? "frame-ancestors 'self' *.space-z.ai" : "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // API routes — prevent embedding in iframes and restrict origins
        source: "/api/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
