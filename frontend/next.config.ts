import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Docker image (backend/../Dockerfile copies
  // .next/standalone into the runtime stage). Vercel ignores this and
  // uses its own build pipeline, so it's safe alongside the Vercel deploy.
  output: "standalone",

  images: {
    // These three hostnames are the full set of S3-compatible storage
    // backends this app supports (backend/app/config.py's aws_*/
    // cloudflare_r2_endpoint_url settings): AWS S3, Cloudflare R2, and
    // Backblaze B2. If the storage provider changes again, add its
    // hostname here AND to the img-src CSP directive below.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
      },
    ],
  },

  /* Hardened HTTP response headers */
  async headers() {
    // Clerk is the only third-party script/frame origin actually used by
    // this app (no Stripe/Sentry in package.json as of this writing).
    // 'unsafe-inline' on script/style is a known trade-off: Next.js App
    // Router injects inline bootstrap scripts and styled-jsx output that a
    // strict nonce-based CSP would otherwise block. A nonce-based CSP
    // (generated per-request in middleware.ts) would close that gap but
    // needs to be built and verified against a live Clerk session — flagged
    // as a follow-up rather than done blind here. Everything else below
    // (connect/img/frame/object/base-uri/form-action) is fully enforced.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      // Keep this list in sync with images.remotePatterns above — same
      // three supported storage backends (S3 / R2 / B2).
      "img-src 'self' data: https://img.clerk.com https://*.amazonaws.com https://*.r2.cloudflarestorage.com https://*.backblazeb2.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com",
      "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  typedRoutes: true,
};

export default nextConfig;
