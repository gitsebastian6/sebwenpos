import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  compiler: {
    removeConsole: false,
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
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors * 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
      {
        // API routes — prevent embedding in iframes
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
  // Don't upload source maps automatically
  disableAutomaticUploads: true,
});
