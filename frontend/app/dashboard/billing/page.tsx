"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  useSubscription,
  useBillingEvents,
  useCreateCheckout,
  useCustomerPortal,
} from "@/hooks/useBilling";
import type { BillingEvent, Subscription, SubscriptionTier } from "@/types/api";

const PLANS: {
  tier: SubscriptionTier;
  name: string;
  priceJpy: string;
  features: string[];
}[] = [
  {
    tier: "free",
    name: "Free",
    priceJpy: "¥0 / month",
    features: [
      "1 resume upload",
      "3 AI analyses",
      "1 rirekisho generation",
      "1 shokumukeirekisho generation",
      "5 job translations",
      "3 interview sessions / month",
    ],
  },
  {
    tier: "basic",
    name: "Basic",
    priceJpy: "¥1,480 / month",
    features: [
      "5 resume uploads",
      "20 AI analyses",
      "10 rirekisho generations",
      "10 shokumukeirekisho generations",
      "30 job translations",
      "20 interview sessions / month",
      "PDF export",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    priceJpy: "¥3,980 / month",
    features: [
      "Unlimited resume uploads",
      "Unlimited AI analyses",
      "Unlimited document generation",
      "Unlimited job translations",
      "Unlimited interview sessions",
      "PDF export",
      "Full culture library access",
      "Priority support",
    ],
  },
];

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingPageInner() {
  const searchParams = useSearchParams();
  const sessionResult = searchParams.get("session"); // "success" | "cancel" from Stripe redirect

  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: events, isLoading: eventsLoading } = useBillingEvents();
  const checkout = useCreateCheckout();
  const portal = useCustomerPortal();

  const currentTier: SubscriptionTier = subscription?.tier ?? "free";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and view billing history.
        </p>
      </div>

      {/* Stripe redirect banners */}
      {sessionResult === "success" && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your subscription is now active. Welcome aboard!
        </div>
      )}
      {sessionResult === "cancel" && (
        <div className="rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Checkout was cancelled. Your plan has not changed.
        </div>
      )}

      {/* Current plan summary */}
      {!subLoading && (
        <CurrentPlanCard
          subscription={subscription ?? null}
          onManage={() => portal.mutate()}
          isManaging={portal.isPending}
          portalError={portal.error?.message ?? null}
        />
      )}

      {/* Plan comparison */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              isCurrent={currentTier === plan.tier}
              isDowngrade={tierRank(plan.tier) < tierRank(currentTier)}
              onSelect={() => checkout.mutate({ tier: plan.tier })}
              isLoading={checkout.isPending && checkout.variables?.tier === plan.tier}
              checkoutError={
                checkout.error && checkout.variables?.tier === plan.tier
                  ? checkout.error.message
                  : null
              }
            />
          ))}
        </div>
      </section>

      {/* Billing history */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Billing history</h2>
        {eventsLoading && <EventsSkeleton />}
        {!eventsLoading && (!events || events.length === 0) && (
          <p className="text-sm text-muted-foreground">No billing events yet.</p>
        )}
        {events && events.length > 0 && <EventsTable events={events} />}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Current plan card
// ---------------------------------------------------------------------------

function CurrentPlanCard({
  subscription,
  onManage,
  isManaging,
  portalError,
}: {
  subscription: Subscription | null;
  onManage: () => void;
  isManaging: boolean;
  portalError: string | null;
}) {
  const tier = subscription?.tier ?? "free";
  const statusLabel = subscription ? formatStatus(subscription.status) : null;
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current plan
          </p>
          <p className="mt-1 text-xl font-bold capitalize">{tier}</p>
          {statusLabel && (
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(subscription?.status ?? "active")}`}
            >
              {statusLabel}
            </span>
          )}
          {periodEnd && (
            <p className="mt-1 text-xs text-muted-foreground">
              {subscription?.cancelled_at ? "Access until" : "Renews"} {periodEnd}
            </p>
          )}
        </div>

        {subscription && (
          <button
            onClick={onManage}
            disabled={isManaging}
            className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            {isManaging ? "Opening…" : "Manage subscription"}
          </button>
        )}
      </div>

      {portalError && <p className="text-sm text-destructive">{portalError}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  isCurrent,
  isDowngrade,
  onSelect,
  isLoading,
  checkoutError,
}: {
  plan: (typeof PLANS)[number];
  isCurrent: boolean;
  isDowngrade: boolean;
  onSelect: () => void;
  isLoading: boolean;
  checkoutError: string | null;
}) {
  const isPro = plan.tier === "pro";

  return (
    <div
      className={`relative flex flex-col rounded-lg border p-5 ${
        isPro ? "border-primary bg-primary/5" : "bg-card"
      } ${isCurrent ? "ring-2 ring-primary" : ""}`}
    >
      {isPro && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
          Most popular
        </span>
      )}

      <div className="space-y-1">
        <p className="font-semibold">{plan.name}</p>
        <p className="text-lg font-bold tabular-nums">{plan.priceJpy}</p>
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-0.5 text-green-600">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isCurrent ? (
          <div className="rounded-md border bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
            Current plan
          </div>
        ) : plan.tier === "free" ? (
          <div className="rounded-md border bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
            {isDowngrade ? "Downgrade via portal" : "Free"}
          </div>
        ) : (
          <button
            onClick={onSelect}
            disabled={isLoading}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-50 ${
              isPro
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "border hover:bg-accent"
            }`}
          >
            {isLoading ? "Redirecting…" : isDowngrade ? "Switch plan" : `Upgrade to ${plan.name}`}
          </button>
        )}
        {checkoutError && <p className="mt-2 text-xs text-destructive">{checkoutError}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing events table
// ---------------------------------------------------------------------------

function EventsTable({ events }: { events: BillingEvent[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Event</th>
            <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">
              Plan change
            </th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium capitalize">
                {e.event_type.replace(/_/g, " ")}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {e.tier_from && e.tier_to
                  ? `${e.tier_from} → ${e.tier_to}`
                  : e.tier_to
                    ? e.tier_to
                    : "—"}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {new Date(e.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierRank(tier: SubscriptionTier): number {
  return { free: 0, basic: 1, pro: 2 }[tier] ?? 0;
}

function formatStatus(status: string): string {
  return (
    { active: "Active", trialing: "Trial", past_due: "Past due", cancelled: "Cancelled" }[status] ??
    status
  );
}

function statusColor(status: string): string {
  return (
    {
      active: "bg-green-100 text-green-800",
      trialing: "bg-blue-100 text-blue-800",
      past_due: "bg-red-100 text-red-800",
      cancelled: "bg-muted text-muted-foreground",
    }[status] ?? "bg-muted text-muted-foreground"
  );
}

function EventsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
