"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { saveSessionToken } from "@/lib/client";
import {
  USE_EXTERNAL_BACKEND,
  authEndpoints,
  normalizeMeResponse,
  describeOAuthError,
} from "@/lib/api-config";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Landing route after Google authentication.
 *
 * External backend (Express /api/v1): the backend completes the OAuth
 * callback itself, sets its session cookie, and redirects the browser here.
 * We then call GET /auth/me with credentials:'include' to read the
 * authenticated user and load it into the existing auth context.
 *
 * Built-in backend: a short-lived signed payload cookie carries the session
 * (handled below), with /api/auth as the "me" fallback.
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { applySessionUser, refreshUser, showToast } = useApp();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) OAuth error / cancellation reported on the redirect URL.
      const hasError =
        searchParams.get("error") ||
        searchParams.get("google_error") ||
        searchParams.get("errorCode") ||
        searchParams.get("cancelled") !== null ||
        searchParams.get("cancelledByUser") !== null;
      if (hasError) {
        if (!cancelled) setError(describeOAuthError(searchParams));
        return;
      }

      try {
        /* ---------------------------------------------------------- *
         * External backend — read the authenticated session via /me
         * ---------------------------------------------------------- */
        if (USE_EXTERNAL_BACKEND) {
          const res = await fetch(authEndpoints.me, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) {
            if (!cancelled) {
              setError(
                res.status === 401
                  ? "Google sign-in didn't establish a session. Please sign in again."
                  : "We couldn't reach your account. Please try again."
              );
            }
            return;
          }
          const payload = await res.json();
          const normalized = normalizeMeResponse(payload);
          if (!normalized?.user) {
            if (!cancelled) {
              setError(
                "We couldn't read your profile after Google sign-in. Please try again."
              );
            }
            return;
          }
          if (normalized.token) saveSessionToken(normalized.token);

          applySessionUser({
            user: normalized.user,
            // External backends return the user; channel/preferences are
            // derived by the UI where present.
            channel: null,
            preferences: null,
            token: normalized.token,
          });
          if (!cancelled) {
            showToast(`Signed in as ${normalized.user.displayName}`, "success");
            const next = searchParams.get("next") || "/";
            router.replace(next);
          }
          return;
        }

        /* ---------------------------------------------------------- *
         * Built-in backend — signed payload cookie from the callback
         * ---------------------------------------------------------- */
        const tokenFromQuery = searchParams.get("token");
        const payloadB64 = readCookie("bharattube_oauth_payload");
        const bridgeToken =
          tokenFromQuery || readCookie("bharattube_oauth_bridge");

        if (payloadB64) {
          try {
            const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
            const pad =
              padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
            const json = JSON.parse(atob(padded + pad));
            if (json?.user && json?.token) {
              applySessionUser({
                user: json.user,
                channel: json.channel,
                preferences: json.preferences,
                token: json.token,
              });
              clearCookie("bharattube_oauth_payload");
              clearCookie("bharattube_oauth_bridge");
              if (!cancelled) {
                showToast(`Signed in as ${json.user.displayName}`, "success");
                router.replace("/");
              }
              return;
            }
          } catch (err) {
            console.error("OAuth payload parse failed:", err);
          }
        }

        if (bridgeToken) saveSessionToken(bridgeToken);

        // Confirm the session from the cookie/bearer token.
        await refreshUser();
        clearCookie("bharattube_oauth_payload");
        clearCookie("bharattube_oauth_bridge");

        if (!cancelled) {
          showToast("Signed in with Google", "success");
          router.replace("/");
        }
      } catch {
        if (!cancelled) {
          setError(
            "We couldn't complete Google sign-in. Check your connection and try again."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySessionUser, refreshUser, router, searchParams, showToast]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-6 text-center">
          <AlertCircle className="w-9 h-9 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-zinc-700 dark:text-zinc-200">{error}</p>
          <a
            href="/login"
            className="mt-5 inline-block px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-sm text-zinc-500">
      <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      <span>Completing Google sign-in...</span>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center text-sm text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Completing sign-in...
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
