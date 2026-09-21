import type { NextConfig } from "next";

/**
 * Auth-critical caching policy.
 *
 * The preview/CDN layer was caching prerendered HTML for a year
 * (`cache-control: s-maxage=31536000`, `x-nextjs-cache: HIT`). A visitor who
 * loaded the app before a deploy therefore kept receiving the OLD HTML shell
 * and the OLD JavaScript bundle — so sign-up/sign-in fixes never reached the
 * browser. Documents and API responses must always revalidate; only immutable
 * build assets and uploaded media may be cached long-term.
 */
const NO_STORE = [
  { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
  { key: "Pragma", value: "no-cache" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/", headers: NO_STORE },
      {
        source: "/:path((?!_next/static|api/media).*)",
        headers: NO_STORE,
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
