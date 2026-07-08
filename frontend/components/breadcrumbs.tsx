import Link from "next/link";
import type { Route } from "next";

interface Crumb {
  label: string;
  href?: Route;
}

/** Trail of links ending in the current (non-linked) page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-muted-foreground">
                /
              </span>
            )}
            {isLast || !item.href ? (
              <span
                aria-current={isLast ? "page" : undefined}
                className="max-w-[240px] truncate font-medium text-foreground"
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
