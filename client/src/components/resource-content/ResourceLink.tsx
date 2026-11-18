import type { ReactNode } from "react";
import { Link } from "wouter";
import type { PortalResourceView } from "@shared/portal-resources";

interface ResourceLinkProps {
  resource: Pick<PortalResourceView, "linkType" | "url">;
  className?: string;
  children: ReactNode;
}

/** An app page opens in place; an external URL opens in a new tab. */
export function ResourceLink({ resource, className, children }: ResourceLinkProps) {
  if (resource.linkType === "internal") {
    return (
      <Link href={resource.url} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={resource.url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
