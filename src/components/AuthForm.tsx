"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Check,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { authRequest } from "@/lib/client";
import {
  USE_EXTERNAL_BACKEND,
  googleLoginUrl,
  authEndpoints,
  normalizeMeResponse,
  apiUrl,
} from "@/lib/api-config";

export type AuthTab = "login" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "letter", label: "One letter", test: (p: string) => /[a-zA-Z]/.test(p) },
  { id: "number", label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.4l3 2.2C7.8 7.5 9.7 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.6 2.8 12 2.8 8.5 2.8 5.5 4.8 3.9 7.4z"
      />
      <path
        fill="#4A90E2"
        d="M12 21.2c2.5 0 4.6-.8 6.1-2.2l-2.9-2.3c-.8.6-1.9 1-3.2 1-3.5 0-5.9-2.3-6.4-4.5l-3 2.3C4.2 18.9 7.7 21.2 12 21.2z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 13.2c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9l-3-2.3C2.2 8.4 2 9.6 2 11.3s.2 2.9.6 4.2l3-2.3z"
      />
    </svg>
  );
}

export function AuthForm({
  tab,
  onTabChange,
  onSuccess,
  initialError,
}: {
  tab: AuthTab;
  onTabChange?: (tab: AuthTab) => void;
  onSuccess?: () => void;
  initialError?: string;
}) {
  const { applySessionUser, hasAccounts, showToast } = useApp();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState(initialError || "");
  const [submitting, setSubmitting] = useState(false);
  const [googleStarting, setGoogleStarting] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(
    // An external Express backend owns OAuth itself, so assume configured.
    USE_EXTERNAL_BACKEND
  );
  const [googleRedirectUri, setGoogleRedirectUri] = useState("");
  const [googleOrigin, setGoogleOrigin] = useState("");
  const [copied, setCopied] = useState("");

  /**
   * Full-page redirect to the BACKEND's Google OAuth start endpoint.
   * The frontend never implements OAuth itself and never sees any secret.
   */
  const startGoogleLogin = () => {
    if (googleStarting || submitting) return;
    setGoogleStarting(true);
    try {
      // A full navigation; the browser takes the user to the backend, which
      // redirects to Google and finally back to /auth/callback.
      window.location.assign(googleLoginUrl());
    } catch {
      setGoogleStarting(false);
      setError(
        "We couldn't open Google sign-in. Please check your connection and try again."
      );
    }
  };

  useEffect(() => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError(initialError || "");
    setSubmitting(false);
  }, [tab, initialError]);

  useEffect(() => {
    // With an external backend, Google OAuth is owned entirely by that server —
    // the button is always active and we must NOT probe the built-in route.
    if (USE_EXTERNAL_BACKEND) {
      setGoogleConfigured(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/auth/google?format=json"), {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data.configured === "boolean") {
          setGoogleConfigured(data.configured);
        }
        if (typeof data.redirectUri === "string") {
          setGoogleRedirectUri(data.redirectUri);
        }
        if (typeof data.javascriptOrigin === "string") {
          setGoogleOrigin(data.javascriptOrigin);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const validate = (): string => {
    if (!EMAIL_RE.test(email.trim().toLowerCase())) {
      return "Please enter a valid email address.";
    }
    if (tab === "signup") {
      const failed = PASSWORD_RULES.find((r) => !r.test(password));
      if (failed) {
        return `Your password does not meet the required requirements (${failed.label.toLowerCase()}).`;
      }
      if (password !== confirmPassword) return "Passwords do not match.";
      return "";
    }
    if (!password) return "Please enter your password.";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      /* ------------------------------------------------------------ *
       * External backend (Express /api/v1):
       *   POST /auth/login -> session cookie + user.
       *   Account creation on that backend is handled by Google or its
       *   own register flow; email sign-in is the documented endpoint.
       * ------------------------------------------------------------ */
      if (USE_EXTERNAL_BACKEND) {
        const emailNorm = email.trim().toLowerCase();

        // Payload covers common Express field names in one request body.
        const registerBody = JSON.stringify({
          email: emailNorm,
          password,
          confirmPassword,
          name: emailNorm.split("@")[0],
          fullName: emailNorm.split("@")[0],
          username: emailNorm.split("@")[0],
        });
        const loginBody = JSON.stringify({ email: emailNorm, password });

        let res: Response | null = null;

        if (tab === "signup") {
          // Try each register endpoint until one exists (not 404).
          for (const url of authEndpoints.registerCandidates) {
            try {
              const attempt = await fetch(url, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: registerBody,
              });
              if (attempt.status === 404) continue; // wrong path, try next
              res = attempt;
              break;
            } catch {
              // network error — surface after the loop
            }
          }
          if (!res) {
            setError(
              "We couldn't reach the sign-up service. Please check your connection and try again."
            );
            return;
          }
          // Duplicate account -> guide the user to sign in.
          if (res.status === 409) {
            setError("An account with this email already exists. Please sign in.");
            return;
          }
        } else {
          res = await fetch(authEndpoints.login, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: loginBody,
          });
        }

        if (!res.ok) {
          let message =
            tab === "signup"
              ? "We couldn't create your account. Please try again."
              : "Incorrect email or password. Please check your details and try again.";
          try {
            const data = await res.json();
            if (res.status >= 500) {
              message = "We couldn't reach the authentication server. Please try again.";
            } else if (res.status === 401 && tab === "login") {
              message = "Incorrect email or password.";
            } else if (data?.message || data?.error) {
              message = String(data.message || data.error);
            }
          } catch {
            /* keep default */
          }
          setError(message);
          return;
        }

        // Resolve the authenticated user (direct body, or a /me follow-up if
        // the backend only set the session cookie).
        const payload = await res.json().catch(() => null);
        let normalized = normalizeMeResponse(payload);
        if (!normalized) {
          const me = await fetch(authEndpoints.me, { credentials: "include" });
          normalized = me.ok ? normalizeMeResponse(await me.json()) : null;
        }

        // If a fresh signup didn't auto-login, log in with the same details.
        if (!normalized?.user && tab === "signup") {
          const loginRes = await fetch(authEndpoints.login, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: loginBody,
          });
          if (loginRes.ok) {
            const lp = await loginRes.json().catch(() => null);
            normalized = normalizeMeResponse(lp);
            if (!normalized) {
              const me = await fetch(authEndpoints.me, { credentials: "include" });
              normalized = me.ok ? normalizeMeResponse(await me.json()) : null;
            }
          }
        }

        if (!normalized?.user) {
          if (tab === "signup") {
            setError(
              "Your account was created. Please sign in with your email and password."
            );
            onTabChange?.("login");
          } else {
            setError("We couldn't sign you in. Please try again.");
          }
          return;
        }

        applySessionUser({
          user: normalized.user,
          channel: null,
          preferences: null,
          token: normalized.token,
        });
        showToast(
          tab === "signup"
            ? "Account created — welcome to BharatTube!"
            : `Signed in as ${normalized.user.displayName}`,
          "success"
        );
        onSuccess?.();
        router.replace("/");
        return;
      }

      const { ok, status, data } = await authRequest(tab, {
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
      });

      if (!ok || !data?.authenticated || !data?.user) {
        setError(
          data?.error ||
            (status >= 500
              ? "Something went wrong. Please try again."
              : "Unable to connect. Please check your internet connection and try again.")
        );
        return;
      }

      applySessionUser({
        user: data.user,
        channel: data.channel,
        preferences: data.preferences,
        token: data.token,
      });

      showToast(
        tab === "signup"
          ? `Account created — welcome to BharatTube!`
          : `Signed in as ${data.user.displayName}`,
        "success"
      );

      onSuccess?.();
      router.replace("/");
    } catch {
      setError(
        "Unable to connect. Please check your internet connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (label: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* ignore */
    }
  };

  const inputClass =
    "w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/40 transition-colors";

  const passwordValid = PASSWORD_RULES.every((r) => r.test(password));

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-medium"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tab === "login" && !hasAccounts && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-700 dark:text-sky-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">No accounts yet.</span>{" "}
            <span>Create the first BharatTube account to get started.</span>
            {onTabChange && (
              <button
                type="button"
                onClick={() => onTabChange("signup")}
                className="mt-1.5 block font-bold text-red-500 hover:underline cursor-pointer"
              >
                Create an account →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Google: real OAuth only. The whole flow runs on the backend. */}
      <button
        type="button"
        onClick={startGoogleLogin}
        disabled={googleStarting || submitting}
        aria-busy={googleStarting}
        aria-label="Continue with Google"
        className="group w-full py-2.5 rounded-xl bg-white dark:bg-zinc-100 border border-zinc-300 dark:border-zinc-200 text-zinc-900 font-semibold text-sm shadow-sm hover:shadow hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2.5 transition-all cursor-pointer"
      >
        {googleStarting ? (
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        ) : (
          <GoogleIcon className="w-5 h-5" />
        )}
        <span>{googleStarting ? "Redirecting to Google…" : "Continue with Google"}</span>
      </button>

      {/*
        Local-backend setup note: only shown when using the built-in Next
        backend and its Google OAuth env vars are not yet configured. With an
        external backend (NEXT_PUBLIC_API_URL set) OAuth is handled there, so
        this panel is never displayed.
      */}
      {!USE_EXTERNAL_BACKEND && !googleConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Google Sign-In is not configured on this server
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Add these <span className="font-semibold">server-only</span> environment
            variables (never put the secret in frontend code), then restart the app:
          </p>
          <pre className="text-[11px] leading-relaxed bg-zinc-950 text-zinc-100 rounded-lg p-3 overflow-x-auto">{`GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_APP_URL=${googleOrigin || "https://your-public-host"}`}</pre>
          <div className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">
              Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client (Web application)
            </p>
            <p>
              Authorized JavaScript origins:{" "}
              <code className="text-[11px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded break-all">
                {googleOrigin || "https://your-public-host"}
              </code>
            </p>
            <p>
              Authorized redirect URI:{" "}
              <code className="text-[11px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded break-all">
                {googleRedirectUri ||
                  `${googleOrigin || "https://your-public-host"}/api/auth/google/callback`}
              </code>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {googleOrigin && (
              <button
                type="button"
                onClick={() => copyText("origin", googleOrigin)}
                className="text-[11px] font-semibold text-red-500 hover:underline cursor-pointer"
              >
                {copied === "origin" ? "Origin copied" : "Copy JavaScript origin"}
              </button>
            )}
            {googleRedirectUri && (
              <button
                type="button"
                onClick={() => copyText("redirect", googleRedirectUri)}
                className="text-[11px] font-semibold text-red-500 hover:underline cursor-pointer"
              >
                {copied === "redirect" ? "Redirect URI copied" : "Copy redirect URI"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
          or
        </span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* Email + password only — no username / handle fields */}
      <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
        <div className="relative">
          <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        {tab === "signup" && (
          <>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(password);
                return (
                  <span
                    key={rule.id}
                    className={`inline-flex items-center gap-1 ${
                      passed ? "text-emerald-500" : "text-zinc-500"
                    }`}
                  >
                    <Check className={`w-3 h-3 ${passed ? "" : "opacity-30"}`} />
                    {rule.label}
                  </span>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-500">
              You can set your channel name and @handle later in{" "}
              <span className="font-semibold">Edit channel</span>.
            </p>
          </>
        )}

        <button
          type="submit"
          disabled={
            submitting || (tab === "signup" && !passwordValid)
          }
          className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold text-sm shadow-lg transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>
            {submitting
              ? tab === "signup"
                ? "Creating account..."
                : "Signing in..."
              : tab === "signup"
              ? "Create account"
              : "Sign in"}
          </span>
        </button>
      </form>

      <div className="flex items-center justify-between text-xs pt-1">
        {tab === "login" ? (
          <>
            <Link
              href="/forgot-password"
              className="text-zinc-500 hover:text-red-500 font-medium"
            >
              Forgot password?
            </Link>
            <span className="text-zinc-500">
              New here?{" "}
              {onTabChange ? (
                <button
                  type="button"
                  onClick={() => onTabChange("signup")}
                  className="text-red-500 font-semibold hover:underline cursor-pointer"
                >
                  Create account
                </button>
              ) : (
                <Link
                  href="/signup"
                  className="text-red-500 font-semibold hover:underline"
                >
                  Create account
                </Link>
              )}
            </span>
          </>
        ) : (
          <span className="text-zinc-500 mx-auto">
            Already have an account?{" "}
            {onTabChange ? (
              <button
                type="button"
                onClick={() => onTabChange("login")}
                className="text-red-500 font-semibold hover:underline cursor-pointer"
              >
                Sign in
              </button>
            ) : (
              <Link
                href="/login"
                className="text-red-500 font-semibold hover:underline"
              >
                Sign in
              </Link>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
