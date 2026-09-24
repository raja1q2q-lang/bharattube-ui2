/**
 * next/navigation shim backed by react-router-dom.
 * Exposes the same hooks the BharatTube UI uses:
 *   usePathname · useParams · useSearchParams · useRouter
 */
import { useMemo, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useParams as routerUseParams,
  useSearchParams as routerUseSearchParams,
} from "react-router-dom";

export function usePathname(): string {
  return useLocation().pathname;
}

type Params<T extends string = string> = Record<T, string | undefined>;

export function useParams<T extends Params = Params>(): T {
  return (routerUseParams() ?? {}) as T;
}

/**
 * Next's useSearchParams returns the URLSearchParams object directly
 * (the setter in the original app is done via useRouter push/replace).
 */
export function useSearchParams(): URLSearchParams {
  return routerUseSearchParams()[0];
}

export interface NextRouter {
  push: (to: string) => void;
  replace: (to: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
}

/**
 * Like Next's router, the returned object is referentially STABLE across
 * renders. Pages list `router` in useCallback/useEffect dependencies; an
 * unstable object would re-run those effects after every state update and
 * restart in-flight data loads.
 */
export function useRouter(): NextRouter {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  return useMemo<NextRouter>(
    () => ({
      push: (to) => navigateRef.current(to),
      replace: (to) => navigateRef.current(to, { replace: true }),
      back: () => navigateRef.current(-1),
      forward: () => navigateRef.current(1),
      // Next's refresh() re-fetches server components; this SPA has none, and
      // a full page reload here would race with a following push().
      refresh: () => {},
    }),
    []
  );
}
