"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  BookOpen,
  Briefcase,
  Check,
  FileText,
  Files,
  Globe,
  House,
  Mic,
  Settings,
  Shield,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { AiQuotaMeter } from "@/components/ai-quota-meter";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useJourney } from "@/hooks/useJourney";
import { useMe } from "@/hooks/useMe";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import type { StageId } from "@/lib/journey";
import { cn } from "@/lib/utils";

interface NavItem {
  href: Route;
  key: string;
  icon: LucideIcon;
}

const HOME: NavItem = { href: "/dashboard", key: "home", icon: House };

// The same seven sections as before, grouped by where they sit in the move to
// Japan. Spec 3 reshapes "apply" around the job pipeline.
const GROUPS: { stage: StageId; labelKey: string; items: NavItem[] }[] = [
  {
    stage: "prepare",
    labelKey: "groupPrepare",
    items: [
      { href: "/dashboard/resumes", key: "resumes", icon: FileText },
      { href: "/dashboard/documents", key: "documents", icon: Files },
    ],
  },
  {
    stage: "apply",
    labelKey: "groupApply",
    items: [
      { href: "/dashboard/jobs", key: "jobs", icon: Briefcase },
      { href: "/dashboard/interview", key: "interview", icon: Mic },
    ],
  },
  {
    stage: "settleIn",
    labelKey: "groupSettleIn",
    items: [
      { href: "/dashboard/visa", key: "visa", icon: Stamp },
      { href: "/dashboard/culture", key: "culture", icon: BookOpen },
    ],
  },
];

const SETTINGS: NavItem = { href: "/dashboard/settings", key: "settings", icon: Settings };
// /admin sits outside /dashboard and 403s for non-admins, so it is only
// offered to those who can actually use it.
const ADMIN: NavItem = { href: "/admin", key: "admin", icon: Shield };

/** Home only on the dashboard itself; every other section on its sub-pages too. */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === HOME.href) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  lang,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  lang: Language;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate?.()}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Current page: fill, weight and the seal stripe, so it isn't colour alone.
        active
          ? "bg-secondary font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-seal"
          : "text-secondary-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
      {t("nav", item.key, lang)}
    </Link>
  );
}

/** ✓ for a finished stage, a seal ring for the stage holding the next step. */
function StageMarker({ n, complete, current }: { n: number; complete: boolean; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] font-semibold",
        complete
          ? "border-indigo bg-indigo text-white"
          : current
            ? "border-seal text-seal"
            : "border-muted-foreground text-muted-foreground",
      )}
    >
      {complete ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
    </span>
  );
}

function Account() {
  const { data: me } = useMe();
  const name = me?.user.full_name;
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <UserButton />
      {me && (
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate font-medium">{name ?? me.user.email}</p>
          {name && <p className="truncate text-xs text-muted-foreground">{me.user.email}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The sidebar's content: shown in the fixed desktop sidebar and, on phones,
 * inside the drawer. onNavigate lets the drawer close when a link is used.
 */
export function SidebarNav({
  onNavigate,
  showAccount = true,
}: {
  onNavigate?: (() => void) | undefined;
  /** Off in the phone drawer, where Clerk's menu can't be clicked; see MobileTopBar. */
  showAccount?: boolean;
}) {
  const { lang } = useLang();
  const pathname = usePathname();
  const { data: me } = useMe();
  const { journey, isLoading } = useJourney();
  const nextStage = journey.next?.stage;

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        onClick={() => onNavigate?.()}
        className="mx-3 mb-2 mt-4 flex h-10 items-center rounded-lg px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark />
      </Link>

      <nav aria-label={t("nav", "main", lang)} className="flex-1 overflow-y-auto px-3 pb-4">
        <ul>
          <li>
            <NavLink
              item={HOME}
              active={isActive(pathname, HOME.href)}
              lang={lang}
              onNavigate={onNavigate}
            />
          </li>
        </ul>

        {GROUPS.map((group, index) => {
          const stage = journey.stages.find((s) => s.id === group.stage);
          // A count is shown only when it's right: not while loading, and not
          // when one of the stage's steps couldn't be checked.
          const showCount = !isLoading && stage !== undefined && !stage.hasUnknown;
          const label = t("nav", group.labelKey, lang);
          const count =
            showCount &&
            t("nav", "stepsDone", lang)
              .replace("{done}", String(stage.done))
              .replace("{total}", String(stage.total));
          return (
            <div key={group.stage} className="mt-5">
              <h2 className="mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">
                <StageMarker
                  n={index + 1}
                  complete={showCount && stage.complete}
                  current={showCount && nextStage === group.stage}
                />
                <span>{label}</span>
                {showCount && (
                  <span
                    aria-hidden="true"
                    className="ml-auto font-medium normal-case tabular-nums tracking-normal text-muted-foreground"
                  >
                    {stage.done}/{stage.total}
                  </span>
                )}
                {count && (
                  <span className="sr-only">
                    {t("nav", "countSep", lang)}
                    {count}
                  </span>
                )}
              </h2>
              {/* The spoken count ("Prepare, 5 of 5 steps done") is in both
                  places: the heading, for heading navigation, and the list's
                  aria-label, which reads the same in every engine. Some
                  screen readers skip list names, so it can't live there
                  alone. The "5/5" above is visual only. */}
              <ul aria-label={count ? `${label}${t("nav", "countSep", lang)}${count}` : label}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      active={isActive(pathname, item.href)}
                      lang={lang}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t px-3 py-3">
        <AiQuotaMeter />
        <div className="flex items-center gap-3 px-3 py-1.5">
          <Globe
            aria-hidden="true"
            className="h-[18px] w-[18px] shrink-0 text-secondary-foreground"
          />
          <LanguageSwitcher />
        </div>
        <ul>
          <li>
            <NavLink
              item={SETTINGS}
              active={isActive(pathname, SETTINGS.href)}
              lang={lang}
              onNavigate={onNavigate}
            />
          </li>
          {me?.user.role === "admin" && (
            <li>
              <NavLink
                item={ADMIN}
                active={isActive(pathname, ADMIN.href)}
                lang={lang}
                onNavigate={onNavigate}
              />
            </li>
          )}
        </ul>
        {showAccount && <Account />}
      </div>
    </div>
  );
}
