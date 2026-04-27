import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  allowedDevOrigins: [
    '.space-z.ai',
  ],
  compiler: {
    // Strip debug/info logs in production, keep error/warn for monitoring
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Exclude examples folder from build
  outputFileTracingExcludes: {
    '*': ['./examples/**'],
  },
  // Security headers on all responses
  async headers() {
    return [
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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

// Wrap with Sentry config (only enables source maps upload in production)
export default withSentryConfig(nextConfig, {
  // Disable automatic source map uploads during build (CI handles this)
  silent: true,
});
