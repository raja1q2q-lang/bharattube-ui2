/**
 * Next.js build: `@/shims/next-navigation` resolves here (tsconfig "paths"),
 * so every BharatTube view uses the REAL next/navigation App Router hooks.
 *
 * (The sibling ../next-navigation.ts is only used by the Vite preview
 * harness, whose bundler does not read tsconfig "paths".)
 */
export { usePathname, useParams, useSearchParams, useRouter } from "next/navigation";
