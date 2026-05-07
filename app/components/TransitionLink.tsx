"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { transitionTo } from "@/app/lib/pageTransition";

interface TransitionLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

/**
 * Drop-in replacement for Next.js <Link> that fades the current page out
 * before navigating, then lets the new page's page-enter animation fade it in.
 */
export function TransitionLink({ href, children, onClick, ...rest }: TransitionLinkProps) {
  const router = useRouter();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      onClick?.(e);
      transitionTo(href, router);
    },
    [href, router, onClick]
  );

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
