import React, { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined> };

export interface NextLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: Href;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
}

function hrefToString(href: Href): string {
  if (typeof href === "string") return href;
  const qs = new URLSearchParams();
  Object.entries(href.query || {}).forEach(([k, v]) => {
    if (v !== undefined) qs.set(k, String(v));
  });
  const q = qs.toString();
  return `${href.pathname || ""}${q ? `?${q}` : ""}`;
}

/** Drop-in replacement for `next/link` backed by react-router. */
const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, replace, scroll: _scroll, prefetch: _prefetch, shallow: _shallow, passHref: _passHref, legacyBehavior: _lb, children, ...rest },
  ref
) {
  const to = hrefToString(href);
  const isExternal = /^([a-z]+:)?\/\//i.test(to) || to.startsWith("mailto:") || to.startsWith("tel:");
  if (isExternal || to.startsWith("#")) {
    return (
      <a ref={ref} href={to} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink ref={ref} to={to} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
});

export default Link;
