/**
 * next/link shim backed by react-router-dom.
 * Accepts Next-style `href` plus any standard anchor props.
 */
import { Link as RouterLink } from "react-router-dom";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export interface NextLinkProps extends AnchorProps {
  href: string;
  /** Next: navigate with history.replaceState. */
  replace?: boolean;
  /** Next: disable scroll restoration (we scroll on pathname change). */
  scroll?: boolean;
  prefetch?: boolean | "none" | "viewport";
}

export default function NextLink({
  href,
  replace,
  onClick,
  ...rest
}: NextLinkProps) {
  const isExternal =
    /^(https?:)?\/\//i.test(href) ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("data:");

  if (isExternal) {
    return <a href={href} {...rest} />;
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Keep default router navigation unless the event was cancelled.
  };

  return (
    <RouterLink
      to={href}
      replace={replace}
      onClick={handleClick}
      {...(rest as object)}
    />
  );
}
