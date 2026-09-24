/**
 * Next.js build: `@/shims/next-link` resolves here (tsconfig "paths"), so every
 * BharatTube view uses the REAL next/link — client-side App Router navigation,
 * prefetching and scroll handling are provided by Next.js itself.
 *
 * (The sibling ../next-link.tsx is only used by the Vite preview harness,
 * whose bundler does not read tsconfig "paths".)
 */
export { default } from "next/link";
