"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "@/shims/next-navigation";
import Link from "@/shims/next-link";
import {
  CheckCircle2,
  ListVideo,
  Info,
  Calendar,
  Eye,
  Users,
  Video as VideoIcon,
  Flame,
  Radio,
  Edit3,
} from "lucide-react";
import {
  UserAvatar,
  SubscribeButton,
  VideoCard,
  VideoItem,
  SkeletonGrid,
  EmptyState,
  ErrorState,
} from "@/components/VideoComponents";
import { formatCount, formatDuration } from "@/lib/format";
import { useApp } from "@/context/AppContext";
import { adaptVideos, type AdaptedChannel } from "@/lib/backend-adapter";
import { apiUrl } from "@/lib/api-config";
import {
  fetchChannelByHandle,
  fetchMyChannel,
  type ChannelLookupResult,
} from "@/lib/channel-service";

/**
 * loading      → viewer/route/request not settled yet (skeleton)
 * success      → channel exists
 * not_found    → backend CONFIRMED the channel does not exist
 * own_missing  → backend CONFIRMED the signed-in user has no channel yet
 * route_missing→ backend exposes no channel route
 * error        → network/server/auth failure
 */
type ChannelLoadStatus =
  | "loading"
  | "success"
  | "not_found"
  | "own_missing"
  | "route_missing"
  | "error";

interface ChannelProfile {
  id: string;
  ownerUserId?: string;
  ownerUsername?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  subscriberCount: number;
  isSubscribed: boolean;
  totalVideos: number;
  totalViews: number;
  createdAt: string;
}

interface PlaylistSummary {
  id: number;
  title: string;
  description: string;
  visibility: string;
  itemCount: number;
  thumbnailUrl: string | null;
}

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, authStatus, openUploadModal, feedRefreshTrigger } = useApp();

  const [channel, setChannel] = useState<ChannelProfile | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [activeTab, setActiveTab] = useState<
    "Home" | "Videos" | "Shorts" | "Live" | "Playlists" | "About"
  >("Home");
  /**
   * Explicit render state. "Channel Not Found" is ONLY rendered once a
   * request has completed and the backend confirmed the channel is absent —
   * never inferred from `channel === null` while data is still loading.
   */
  const [status, setStatus] = useState<ChannelLoadStatus>("loading");
  const [error, setError] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [createChannelError, setCreateChannelError] = useState("");

  /** Monotonic request id — responses from superseded loads are ignored. */
  const requestIdRef = useRef(0);
  /** Own channel already fetched via /channel/me before the canonical redirect. */
  const prefetchedRef = useRef<AdaptedChannel | null>(null);

  const currentUserId = user?.id != null ? String(user.id) : null;
  /** We must know WHO the viewer is before we can resolve "/channel/<userId>". */
  const viewerResolved = authStatus !== "loading" || currentUserId !== null;

  /**
   * Loads REAL channel data from the deployed backend (shared lookup in
   * lib/channel-service, also used by Edit Channel).
   *
   * VERIFIED backend contract:
   *   GET /channel/me      (auth) → the signed-in user's own channel
   *   GET /channel/:handle        → public channel, keyed by HANDLE
   * "Your Channel" links carry the signed-in user's id, so that case is
   * resolved through /channel/me and then redirected to the canonical
   * handle URL (so refresh keeps working). Channel videos come from the real
   * GET /videos?userId=<ownerUserId>.
   */
  const loadChannel = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    setStatus("loading");
    setError("");

    const applyChannel = async (adapted: AdaptedChannel) => {
      let channelVideos: VideoItem[] = [];
      if (adapted.ownerUserId) {
        try {
          const vres = await fetch(
            apiUrl(`/videos?userId=${encodeURIComponent(adapted.ownerUserId)}`),
            { cache: "no-store" }
          );
          if (vres.ok) {
            channelVideos = adaptVideos(await vres.json()) as unknown as VideoItem[];
          }
        } catch {
          // A failed video list must not turn a real channel into an error.
          channelVideos = [];
        }
      }
      if (!isCurrent()) return;
      setChannel({
        id: adapted.id,
        ownerUserId: adapted.ownerUserId,
        ownerUsername: adapted.ownerUsername,
        username: adapted.username,
        displayName: adapted.displayName,
        avatarUrl: adapted.avatarUrl,
        bannerUrl: adapted.bannerUrl,
        bio: adapted.bio,
        isVerified: adapted.isVerified,
        subscriberCount: adapted.subscriberCount,
        isSubscribed: adapted.isSubscribed,
        totalVideos: adapted.totalVideos,
        totalViews: adapted.totalViews,
        createdAt: adapted.createdAt,
      });
      setVideos(channelVideos);
      setPlaylists([]);
      setStatus("success");
    };

    const applyFailure = (result: Exclude<ChannelLookupResult, { status: "success" }>, own: boolean) => {
      if (!isCurrent()) return;
      setChannel(null);
      setVideos([]);
      setPlaylists([]);
      if (result.status === "route_missing") {
        setStatus("route_missing");
      } else if (result.status === "not_found") {
        setStatus(own ? "own_missing" : "not_found");
      } else {
        setError(result.message);
        setStatus("error");
      }
    };

    const slug = String(id ?? "").trim();
    if (!slug) {
      applyFailure({ status: "not_found", message: "Channel not found" }, false);
      return;
    }

    try {
      // Canonical handle URL reached right after resolving /channel/me.
      const prefetched = prefetchedRef.current;
      prefetchedRef.current = null;
      if (prefetched && prefetched.username === slug) {
        await applyChannel(prefetched);
        return;
      }

      // "Your Channel" link (/channel/<userId>) → resolve the REAL channel.
      if (currentUserId !== null && slug === currentUserId) {
        const mine = await fetchMyChannel({ currentUserId });
        if (!isCurrent()) return;
        if (mine.status !== "success") {
          applyFailure(mine, true);
          return;
        }
        const handle = mine.channel.username.trim();
        if (handle && handle !== slug) {
          // Preserve the original query (?tab=...) so no link intent is lost.
          // Hash router: the query lives inside the hash fragment.
          const hashQuery = window.location.hash.split("?")[1];
          const currentQuery = window.location.search || (hashQuery ? `?${hashQuery}` : "");
          prefetchedRef.current = mine.channel;
          // Stay in LOADING: the route change re-runs this loader, which
          // renders the prefetched channel without a second request.
          router.replace(`/channel/${encodeURIComponent(handle)}${currentQuery}`);
          return;
        }
        await applyChannel(mine.channel);
        return;
      }

      // Public channel by handle.
      const result = await fetchChannelByHandle(slug, { currentUserId });
      if (!isCurrent()) return;
      if (result.status === "success") {
        await applyChannel(result.channel);
      } else {
        applyFailure(result, false);
      }
    } catch (err) {
      if (!isCurrent()) return;
      const isNetwork =
        err instanceof TypeError ||
        /fetch|network|cors/i.test(String((err as Error)?.message || ""));
      applyFailure(
        {
          status: "error",
          message: isNetwork
            ? "Could not reach the video service. The server may be offline or blocking requests from this site."
            : "Failed to load channel data.",
        },
        false
      );
    }
  }, [id, currentUserId, router]);

  useEffect(() => {
    // Until auth has resolved, remain in the LOADING state — do not request
    // (and certainly do not declare "not found") for an unknown viewer.
    if (!viewerResolved) return;
    loadChannel();
  }, [loadChannel, viewerResolved, feedRefreshTrigger]);

  // Invalidate any in-flight request when the page unmounts.
  useEffect(() => {
    return () => {
      requestIdRef.current++;
    };
  }, []);

  /**
   * Uses the backend's EXISTING authenticated POST /channel route. The server
   * derives ownership from the session; we only send the real signed-in
   * profile values as initial channel defaults. No channel is fabricated in
   * the browser and duplicate creation remains a backend concern.
   */
  const createMyChannel = async () => {
    if (!user || String(user.id) !== String(id) || creatingChannel) return;
    setCreatingChannel(true);
    setCreateChannelError("");
    try {
      const res = await fetch(apiUrl("/channel"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName: user.displayName,
          handle: user.username,
          description: user.bio || "",
          logo: user.avatarUrl || "",
          banner: user.bannerUrl || "",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateChannelError(
          payload?.message ||
            payload?.error ||
            "The server could not create your channel. Please try again."
        );
        return;
      }
      // Reload through GET /channel/me → canonical handle redirect. The
      // displayed channel will only appear after the server confirms it.
      await loadChannel();
    } catch {
      setCreateChannelError(
        "Could not reach the server. Please check your connection and try again."
      );
    } finally {
      setCreatingChannel(false);
    }
  };

  // Anything not yet settled (or a success whose data is not in state yet)
  // renders the existing skeleton — never a "not found" state.
  if (status === "loading" || (status === "success" && !channel)) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="w-full h-44 sm:h-56 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-6" />
        <SkeletonGrid count={4} />
      </div>
    );
  }

  /**
    * This deployment's backend exposes `GET /channel/:handle` (singular, keyed
    * by the channel HANDLE) and has no channel route at all if this flag is set.
    * We never fabricate an identity — the notice below is exact.
    */
  if (status === "route_missing") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400">
            Channel information isn&apos;t available from this backend
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
            The API responds{" "}
            <span className="font-mono">Route &apos;/channel/{id}&apos; not found</span>.
            Videos below are the real uploads returned by the API for this user.
          </p>
        </div>

        {videos.length === 0 ? (
          <EmptyState
            title="No videos from this user yet"
            description="The API returned no uploads for this user id."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (status === "own_missing") {
    const isCurrentUserRoute = Boolean(user && String(user.id) === String(id));
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        {createChannelError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
            {createChannelError}
          </div>
        )}
        <EmptyState
          title="You don't have a channel yet"
          description={
            isCurrentUserRoute
              ? "No channel record exists for your account. Create your real channel using your authenticated profile, then it will be loaded from the server."
              : "No channel record exists for this user on the server."
          }
          actionLabel={isCurrentUserRoute ? (creatingChannel ? "Creating channel..." : "Create your channel") : "Go back"}
          onAction={isCurrentUserRoute ? createMyChannel : () => router.push("/you")}
        />
      </div>
    );
  }

  // Reached only after a COMPLETED request: backend-confirmed absence or a
  // real API/network error.
  if (status === "not_found" || status === "error" || !channel) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <ErrorState
          message={status === "error" ? error || "Failed to load channel data." : "Channel not found"}
          onRetry={loadChannel}
        />
      </div>
    );
  }

  const standardVideos = videos.filter((v) => !v.isShort && !v.isLive);
  const shortVideos = videos.filter((v) => v.isShort);
  const liveVideos = videos.filter((v) => v.isLive);
  // Ownership: compare the signed-in user id with the channel owner id.
  const isOwner = Boolean(
    user &&
      (String(user.id) === String(channel.ownerUserId || "") ||
        (channel.ownerUsername && String(user.username) === channel.ownerUsername))
  );

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
      {/* Channel Banner */}
      <div className="relative w-full h-28 sm:h-52 md:h-60 rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-r from-zinc-900 via-red-950/60 to-zinc-900 border border-zinc-800/70">
        {channel.bannerUrl ? (
          <img
            src={channel.bannerUrl}
            alt={`${channel.displayName} banner`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-zinc-500 text-xs uppercase tracking-widest font-semibold">
              {channel.displayName} • Broadcast Channel
            </span>
          </div>
        )}
      </div>

      {/* Channel Header Info */}
      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <UserAvatar
            name={channel.displayName}
            avatarUrl={channel.avatarUrl}
            size="xl"
          />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white break-words">
              <span>{channel.displayName}</span>
              {channel.isVerified && (
                <CheckCircle2 className="w-5 h-5 text-zinc-400" />
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                @{channel.username}
              </span>
              <span>•</span>
              <span>
                {formatCount(
                  channel.subscriberCount,
                  "Subscriber",
                  "Subscribers"
                )}
              </span>
              <span>•</span>
              <span>
                {formatCount(channel.totalVideos, "video", "videos")}
              </span>
            </div>
            {channel.bio && (
              <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl line-clamp-2">
                {channel.bio}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isOwner ? (
            <>
              <Link
                href="/edit-channel"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs sm:text-sm font-semibold transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Channel</span>
              </Link>
              <button
                type="button"
                onClick={openUploadModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-semibold shadow cursor-pointer"
              >
                <span>Upload Video</span>
              </button>
            </>
          ) : (
            <SubscribeButton
              channelId={channel.username || channel.id}
              isOwner={isOwner}
              initialSubscribed={channel.isSubscribed}
              onStatusChange={(sub, newCount) => {
                setChannel((prev) =>
                  prev
                    ? { ...prev, isSubscribed: sub, subscriberCount: newCount }
                    : prev
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Channel Navigation Tabs */}
      <div className="sticky top-14 z-20 bg-zinc-50/95 dark:bg-[#0F0F0F]/95 backdrop-blur-md flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar border-b border-zinc-200 dark:border-zinc-800 mb-6 -mx-3 px-3 sm:mx-0 sm:px-0">
        {(
          ["Home", "Videos", "Shorts", "Live", "Playlists", "About"] as const
        ).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer active:opacity-70 ${
              activeTab === tab
                ? "border-red-600 text-red-600 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Home" && (
        <div className="space-y-10">
          {videos.length === 0 ? (
            <EmptyState
              title="This channel hasn't uploaded any videos yet"
              description="Once videos or Shorts are published by this creator, they will appear here."
              actionLabel={isOwner ? "Upload Your First Video" : undefined}
              onAction={isOwner ? openUploadModal : undefined}
            />
          ) : (
            <>
              {standardVideos.length > 0 && (
                <section>
                  <h2 className="text-base font-bold mb-4">Videos</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
                    {standardVideos.map((v) => (
                      <VideoCard key={v.id} video={v} />
                    ))}
                  </div>
                </section>
              )}

              {shortVideos.length > 0 && (
                <section>
                  <h2 className="text-base font-bold mb-4 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-600" />
                    <span>Shorts</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                    {shortVideos.map((s) => (
                      <Link
                        key={s.id}
                        href={`/shorts?id=${s.id}`}
                        className="group flex flex-col gap-2"
                      >
                        <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                          <img
                            src={s.thumbnailUrl}
                            alt={s.title}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px]">
                            {formatDuration(s.duration)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold line-clamp-2">
                          {s.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "Videos" &&
        (standardVideos.length === 0 ? (
          <EmptyState
            title="No standard videos uploaded yet"
            description="Standard 16:9 videos uploaded by this channel will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {standardVideos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        ))}

      {activeTab === "Shorts" &&
        (shortVideos.length === 0 ? (
          <EmptyState
            title="No Shorts uploaded yet"
            description="Vertical Shorts uploaded by this channel will appear here."
            icon={<Flame className="w-7 h-7 text-red-500" />}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {shortVideos.map((s) => (
              <Link
                key={s.id}
                href={`/shorts?id=${s.id}`}
                className="group flex flex-col gap-2"
              >
                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
                  <img
                    src={s.thumbnailUrl}
                    alt={s.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <h3 className="text-sm font-semibold line-clamp-2">
                  {s.title}
                </h3>
                <span className="text-xs text-zinc-500">
                  {formatCount(s.viewsCount, "view", "views")}
                </span>
              </Link>
            ))}
          </div>
        ))}

      {activeTab === "Live" &&
        (liveVideos.length === 0 ? (
          <EmptyState
            title="No live streams available"
            description="This channel has no active or archived live broadcasts."
            icon={<Radio className="w-7 h-7 text-zinc-400" />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {liveVideos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        ))}

      {activeTab === "Playlists" &&
        (playlists.length === 0 ? (
          <EmptyState
            title="No playlists yet"
            description="Public playlists created by this channel will be listed here."
            icon={<ListVideo className="w-7 h-7 text-zinc-400" />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {playlists.map((pl) => (
              <Link
                key={pl.id}
                href={`/playlists?id=${pl.id}`}
                className="group flex flex-col gap-2 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-red-500/50 transition-colors"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-800 flex items-center justify-center">
                  {pl.thumbnailUrl ? (
                    <img
                      src={pl.thumbnailUrl}
                      alt={pl.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ListVideo className="w-8 h-8 text-zinc-500" />
                  )}
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/85 text-white text-xs font-semibold">
                    {pl.itemCount} videos
                  </span>
                </div>
                <h3 className="font-bold text-sm group-hover:text-red-500 transition-colors">
                  {pl.title}
                </h3>
                <p className="text-xs text-zinc-500 line-clamp-1">
                  {pl.description || "View full playlist"}
                </p>
              </Link>
            ))}
          </div>
        ))}

      {activeTab === "About" && (
        <div className="max-w-2xl p-6 rounded-2xl bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div>
            <h3 className="text-base font-bold mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-red-600" />
              <span>Channel Description</span>
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
              {channel.bio || "This creator has not added a biography yet."}
            </p>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-zinc-400" />
              <span>
                {formatCount(
                  channel.subscriberCount,
                  "Subscriber",
                  "Subscribers"
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <VideoIcon className="w-4 h-4 text-zinc-400" />
              <span>
                {formatCount(channel.totalVideos, "video", "videos")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Eye className="w-4 h-4 text-zinc-400" />
              <span>
                {formatCount(channel.totalViews, "total view", "total views")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-zinc-400" />
              <span>
                Joined {new Date(channel.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
