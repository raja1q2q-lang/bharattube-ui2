// Must be installed before any other module patches window.fetch.
import "./lib/local-activity";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

/**
 * The app uses hash routing so it works on any static host. If the page was
 * opened on a real path (e.g. an OAuth redirect to /auth/google/callback?token=…),
 * move that path + query into the hash so the router picks it up.
 */
(() => {
  const { pathname, search, hash } = window.location;
  const isRootFile = pathname === "/" || /\/index\.html?$/.test(pathname);
  if (!isRootFile && !hash) {
    window.history.replaceState(null, "", `/#${pathname}${search}`);
  }
})();

// Match the original <html className="dark"> + body classes from layout.tsx
document.documentElement.classList.add("dark");
document.body.className =
  "bg-zinc-50 dark:bg-[#0F0F0F] text-zinc-900 dark:text-[#F1F1F1] antialiased selection:bg-red-600 selection:text-white";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
