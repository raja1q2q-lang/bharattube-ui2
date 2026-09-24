/**
 * Client-side replacement for the Next.js `/api/activity` route handler.
 * Intercepts same-origin `/api/activity` fetches and delegates them to the
 * external BharatTube backend exactly like the original server route did.
 */
const BACKEND_BASE = (
  import.meta.env.VITE_API_URL || "https://bharattube-ylmq.onrender.com/api/v1"
).replace(/\/+$/, "");

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function isActivityUrl(url: string): URL | null {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin && u.pathname === "/api/activity") return u;
  } catch {
    /* ignore */
  }
  return null;
}

export function installLocalActivityHandler() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __btActivity?: boolean };
  if (w.__btActivity) return;
  w.__btActivity = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = isActivityUrl(rawUrl);
    if (!u) return originalFetch(input, init);

    const incoming = new Headers(
      init?.headers ?? (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined)
    );
    const headers: Record<string, string> = {};
    const auth = incoming.get("authorization");
    if (auth) headers["Authorization"] = auth;
    const method = (init?.method || "GET").toUpperCase();

    if (method === "GET") {
      const type = u.searchParams.get("type") || "notifications";
      if (type === "notifications") {
        try {
          const res = await originalFetch(`${BACKEND_BASE}/notifications`, {
            headers,
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data)
              ? data
              : Array.isArray(data.notifications)
              ? data.notifications
              : Array.isArray(data.data)
              ? data.data
              : [];
            const unreadCount =
              typeof data.unreadCount === "number"
                ? data.unreadCount
                : list.filter((n: { isRead?: boolean; read?: boolean }) => !n.isRead && !n.read).length;
            return json({ notifications: list, unreadCount });
          }
        } catch {
          /* offline */
        }
        return json({ notifications: [], unreadCount: 0 });
      }
      if (type === "search") {
        const empty = { videos: [], channels: [], playlists: [], searchHistory: [], suggestions: [] };
        const q = (u.searchParams.get("q") || "").trim();
        if (!q) return json(empty);
        try {
          const res = await originalFetch(`${BACKEND_BASE}/search?q=${encodeURIComponent(q)}`, {
            headers,
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const videos = Array.isArray(data.videos)
              ? data.videos
              : Array.isArray(data.data)
              ? data.data
              : Array.isArray(data)
              ? data
              : [];
            return json({
              ...empty,
              videos,
              channels: Array.isArray(data.channels) ? data.channels : [],
              playlists: Array.isArray(data.playlists) ? data.playlists : [],
            });
          }
        } catch {
          /* offline */
        }
        return json(empty);
      }
      return json({ success: true });
    }

    // POST
    let body: Record<string, unknown> = {};
    try {
      if (typeof init?.body === "string") body = JSON.parse(init.body);
    } catch {
      /* ignore */
    }
    const action = String(body.action || "");
    const postHeaders = { ...headers, "Content-Type": "application/json" };
    const call = async (path: string, m: string) => {
      try {
        await originalFetch(`${BACKEND_BASE}${path}`, { method: m, headers: postHeaders, credentials: "include" });
      } catch {
        /* safe fallback */
      }
    };
    if (action === "clear_watch_history") await call("/history", "DELETE");
    else if (action === "remove_history_item" && body.videoId) await call(`/history/${body.videoId}`, "DELETE");
    else if (action === "mark_all_notifications_read" || action === "mark_notification_read")
      await call("/notifications/read", "PATCH");
    return json({ success: true });
  };
}

installLocalActivityHandler();
