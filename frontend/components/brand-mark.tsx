import { cn } from "@/lib/utils";

/**
 * The seal logo: a vermilion circle with 職 ("job"), and the wordmark. The
 * seal is decorative; the wordmark carries the name, visually hidden when
 * compact (always, or with "mobile" only below the sm breakpoint) so a link
 * wrapping it still has one.
 */
export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean | "mobile";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-seal font-jp text-[13px] font-bold text-white"
      >
        職
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-[15px] font-bold",
          compact === true && "sr-only",
          compact === "mobile" && "sr-only sm:not-sr-only",
        )}
      >
        Japan Job Support
      </span>
    </span>
  );
}
