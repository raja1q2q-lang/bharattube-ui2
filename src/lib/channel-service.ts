/**
 * Shared channel lookup for BharatTube.
 *
 * Both the Channel page and the Edit Channel page need "the real channel for
 * this account", so both use the helpers below instead of each performing its
 * own slightly different request. The endpoints are the ones the deployed
 * backend actually exposes (verified in api-config):
 *
 *   GET /channel/me       → authenticated, server derives the owner's channel
 *   GET /channel/:handle  → public lookup, keyed by the channel HANDLE
 *
 * Nothing here fabricates data: every value is mapped from the API response.
 */
import {
  adaptChannel,
  unwrapEnvelope,
  type AdaptedChannel,
} from "@/lib/backend-adapter";
import {
  channelApiUrl,
  channelMeApiUrl,
  isRouteNotFound,
} from "@/lib/api-config";

/** A channel exactly as stored on the backend (plus form-facing fields). */
export interface ChannelData extends AdaptedChannel {
  contactEmail: string;
  links: { label: string; url: string }[];
}

/**
 * Explicit load states. "notfound" is ONLY produced after a completed request
 * in which the backend confirmed the channel does not exist — a pending
 * request is always "loading", never "notfound".
 */
export type ChannelStatus =
  | "loading"
  | "success"
  | "notfound"
  | "routemissing"
  | "error";

export type ChannelResult =
  | { status: "success"; channel: ChannelData }
  | { status: "notfound" }
  | { status: "routemissing" }
  | { status: "error"; message: string };

/** Human message for a thrown request error (network vs. processing). */
export function channelErrorMessage(err: unknown): string {
  const isNetwork =
    err instanceof TypeError ||
    /fetch|network|cors/i.test(String((err as Error)?.message || ""));
  return isNetwork
    ? "Could not reach the video service. The server may be offline or blocking requests from this site."
    : "Failed to load channel data.";
}

/** Map a raw channel payload into the shape both pages consume. */
export function toChannelData(
  payload: unknown,
  currentUserId?: string | null
): ChannelData | null {
  const adapted = adaptChannel(payload, {
    currentUserId: currentUserId ?? null,
  });
  if (!adapted) return null;
  const d = unwrapEnvelope(payload);
  const raw = ((d && (d.channel ?? d)) || {}) as Record<string, any>;
  const links = Array.isArray(raw.links)
    ? raw.links.map((l: Record<string, any>) => ({
        label: String(l?.label ?? ""),
        url: String(l?.url ?? ""),
      }))
    : [];
  return {
    ...adapted,
    contactEmail: String(raw.contactEmail ?? raw.email ?? ""),
    links,
  };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Public channel lookup by handle (or legacy id). Distinguishes
 * "backend has no channel route" from "no such channel" from "server error".
 */
export async function fetchChannelByIdentifier(
  handleOrId: string,
  currentUserId?: string | null
): Promise<ChannelResult> {
  let res: Response;
  try {
    res = await fetch(channelApiUrl(handleOrId), {
      cache: "no-store",
      credentials: "include",
    });
  } catch (err) {
    return { status: "error", message: channelErrorMessage(err) };
  }

  const payload = await readJson(res);
  if (isRouteNotFound(payload)) return { status: "routemissing" };

  if (!res.ok) {
    // Only a completed 404 is proof that the channel does not exist.
    if (res.status === 404) return { status: "notfound" };
    const msg =
      payload && typeof payload === "object"
        ? String(
            (payload as Record<string, unknown>).message ||
              (payload as Record<string, unknown>).error ||
              ""
          )
        : "";
    return {
      status: "error",
      message: msg || `The server could not load this channel (${res.status}).`,
    };
  }

  const channel = toChannelData(payload, currentUserId);
  return channel ? { status: "success", channel } : { status: "notfound" };
}

/** Authenticated lookup of the signed-in owner's channel. */
export async function fetchMyChannel(
  currentUserId?: string | null
): Promise<ChannelResult> {
  let res: Response;
  try {
    res = await fetch(channelMeApiUrl(), {
      cache: "no-store",
      credentials: "include",
    });
  } catch (err) {
    return { status: "error", message: channelErrorMessage(err) };
  }

  const payload = await readJson(res);
  if (isRouteNotFound(payload)) return { status: "routemissing" };

  if (!res.ok) {
    if (res.status === 404) return { status: "notfound" };
    const msg =
      payload && typeof payload === "object"
        ? String(
            (payload as Record<string, unknown>).message ||
              (payload as Record<string, unknown>).error ||
              ""
          )
        : "";
    return {
      status: "error",
      message: msg || `The server could not load your channel (${res.status}).`,
    };
  }

  const channel = toChannelData(payload, currentUserId);
  return channel ? { status: "success", channel } : { status: "notfound" };
}

/**
 * Resolve the SIGNED-IN USER's real channel. Same flow the Channel page uses:
 * authenticated GET /channel/me first, then the public handle lookup.
 */
export async function fetchCurrentUsersChannel(
  user: { id?: string | number | null; username?: string | null } | null,
  currentUserId?: string | null
): Promise<ChannelResult> {
  const mine = await fetchMyChannel(currentUserId);
  if (mine.status === "success" || mine.status === "error") return mine;

  const handle = String(user?.username ?? "").trim();
  if (handle) {
    const byHandle = await fetchChannelByIdentifier(handle, currentUserId);
    if (byHandle.status !== "notfound") return byHandle;
  }

  return mine;
}
