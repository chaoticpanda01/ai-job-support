import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { toneSoft, toneText, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const ICONS: Record<Tone, LucideIcon> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/**
 * A message in a tinted box. Only a failure is role="alert"; anything else is
 * a polite role="status", so good news isn't read out as an error. The role
 * sits on the message alone, so the action's label isn't announced with it.
 */
export function Alert({
  tone = "danger",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md px-4 py-3 text-sm",
        toneSoft[tone],
        toneText[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div role={tone === "danger" ? "alert" : "status"} className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
