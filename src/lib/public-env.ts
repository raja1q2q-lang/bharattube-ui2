/**
 * Public (browser-safe) environment configuration.
 *
 * Only NEXT_PUBLIC_* values are read here — they are inlined into the client
 * bundle at build time by Next.js, so NEVER put secrets in them. Server-only
 * secrets (GOOGLE_CLIENT_SECRET, JWT_SECRET, MONGO_URI, …) live on the
 * BharatTube backend and are never referenced by the frontend.
 *
 *   NEXT_PUBLIC_API_URL=https://bharattube-ylmq.onrender.com/api/v1
 */

/** The deployed BharatTube backend — used when no env override is set. */
export const DEFAULT_API_BASE = "https://bharattube-ylmq.onrender.com/api/v1";

function readNextPublicApiUrl(): string {
  try {
    // Written as literal `process.env.NEXT_PUBLIC_*` member expressions so
    // Next.js can inline them at build time (dynamic access is NOT inlined).
    return (
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      ""
    );
  } catch {
    // `process` does not exist in non-Next bundles (e.g. the Vite preview).
    return "";
  }
}

function readVitePreviewApiUrl(): string {
  try {
    const env = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env;
    return env?.VITE_API_URL || "";
  } catch {
    return "";
  }
}

/** Backend API base URL (no trailing slash). */
export function publicApiBase(): string {
  return (readNextPublicApiUrl() || readVitePreviewApiUrl() || DEFAULT_API_BASE).replace(
    /\/+$/,
    ""
  );
}
