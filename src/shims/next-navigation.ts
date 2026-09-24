import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams as useRRSearchParams } from "react-router-dom";

/** Drop-in replacement for `next/navigation`'s useRouter. */
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string, _opts?: unknown) => {
        navigate(href);
        window.scrollTo(0, 0);
      },
      replace: (href: string, _opts?: unknown) => navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => {
        /* SPA: data is re-fetched by components themselves */
      },
      prefetch: (_href: string) => {},
    }),
    [navigate]
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRRSearchParams();
  return params;
}

export function useParams<T extends Record<string, string>>(): T {
  // Not used by the app directly; provided for completeness.
  return {} as T;
}

/** Current router location (works with the hash router). */
export function hashLocation(): { pathname: string; search: string } {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const idx = raw.indexOf("?");
  return idx === -1
    ? { pathname: raw, search: "" }
    : { pathname: raw.slice(0, idx), search: raw.slice(idx) };
}

/** Base used for shareable links (origin + page path + hash). */
export function appOrigin(): string {
  return `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/#`;
}
