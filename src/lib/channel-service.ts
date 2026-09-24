/**
 * Shared channel lookup used by BOTH the Channel page and Edit Channel.
 *
 * VERIFIED backend contract (probed live):
 *   GET /channel/me       (auth) → { success, data: <channel> }  | 401 | 404
 *   GET /channel/:handle         → { success, data: <channel> }  | 404 "Channel not found"
 *
 * Every lookup resolves to an explicit, discriminated result so callers can
 * render LOADING / SUCCESS / NOT FOUND / ERROR without ever inferring
 * "not found" from a `null` that simply hasn't loaded yet.
 */
import { channelApiUrl, channelMeApiUrl, isRouteNotFound } from "./api-config";
import { adaptChannel, unwrapEnvelope, type AdaptedChannel } from "./backend-adapter";

export type ChannelLookupResult =
  | {
      status: "success";
      channel: AdaptedChannel;
      /** Raw backend channel record (for fields the adapter doesn't map). */
      raw: Record<string, unknown>;
    }
  /** The backend explicitly confirmed there is no such channel. */
  | { status: "not_found"; message: string }
  /** This backend exposes no channel route at all. */
  | { status: "route_missing" }
  /** Network / server / auth failure — NOT a confirmation of absence. */
  | { status: "error"; message: string; httpStatus?: number };

const NETWORK_ERROR =
  "Could not reach the video service. The server may be offline or blocking requests from this site.";

function messageOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  return String(p.message || p.error || "");
}

function describeFailure(err: unknown): string {
  const isNetwork =
    err instanceof TypeError ||
    /fetch|network|cors/i.test(String((err as Error)?.message || ""));
  return isNetwork ? NETWORK_ERROR : "Failed to load channel data.";
}

async function lookup(
  url: string,
  opts: { currentUserId?: string | null; authenticated?: boolean; signal?: AbortSignal }
): Promise<ChannelLookupResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      credentials: opts.authenticated ? "include" : "same-origin",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return { status: "error", message: describeFailure(err) };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    if (isRouteNotFound(payload)) return { status: "route_missing" };
    const msg = messageOf(payload);
    if (res.status === 404) {
      return { status: "not_found", message: msg || "Channel not found" };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        status: "error",
        httpStatus: res.status,
        message: "Your session could not be verified. Please sign in again.",
      };
    }
    return {
      status: "error",
      httpStatus: res.status,
      message: msg || `The server returned an error (${res.status}).`,
    };
  }

  const channel = adaptChannel(payload, { currentUserId: opts.currentUserId ?? null });
  if (!channel) {
    // 200 with no channel record: the backend answered and there is none.
    return { status: "not_found", message: "Channel not found" };
  }
  const envelope = unwrapEnvelope(payload);
  const raw = ((envelope.channel ?? envelope) || {}) as Record<string, unknown>;
  return { status: "success", channel, raw };
}

/** Public channel by HANDLE (the backend's only public channel key). */
export function fetchChannelByHandle(
  handle: string,
  opts: { currentUserId?: string | null; signal?: AbortSignal } = {}
): Promise<ChannelLookupResult> {
  return lookup(channelApiUrl(handle), { ...opts, authenticated: true });
}

/** The signed-in user's OWN channel via the authenticated /channel/me. */
export function fetchMyChannel(
  opts: { currentUserId?: string | null; signal?: AbortSignal } = {}
): Promise<ChannelLookupResult> {
  return lookup(channelMeApiUrl(), { ...opts, authenticated: true });
}
