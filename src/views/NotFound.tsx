import Link from "@/shims/next-link";
import { AlertTriangle } from "lucide-react";

/** Shown for URLs that match no BharatTube route. */
export default function NotFoundView() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
        <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto mb-3" />
        <h1 className="text-base font-bold">404 — Page not found</h1>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 px-5 py-2 text-sm font-semibold text-white"
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
