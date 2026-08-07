"use client";

import { useEffect, useState } from "react";
import { api, type Plan, type Subscription } from "@/lib/api";
import { Badge, Button, Card, Spinner, statusTone } from "@/components/ui";

function hoursLabel(seconds: number): string {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

const PLAN_META: Record<
  string,
  { blurb: string; hoursLabel: string; featured?: boolean }
> = {
  starter: {
    blurb: "For light meeting loads and core reports.",
    hoursLabel: "8 hours / month",
  },
  pro: {
    blurb: "Best for individuals who live in meetings and the browser.",
    hoursLabel: "30 hours / month",
    featured: true,
  },
  business: {
    blurb: "Unlimited hours, API access, and team workspace.",
    hoursLabel: "Unlimited hours",
  },
};

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Subscription>("/api/billing/subscription").then(setSubscription).catch(() => null);
    api<{ plans: Plan[] }>("/api/billing/plans")
      .then((res) =>
        setPlans(
          res.plans
            .filter((p) => p.priceMonthlyCents > 0)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        ),
      )
      .catch(() => setPlans([]));
  }, []);

  async function checkout(planId: string) {
    setBusy(planId);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    try {
      const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
      setBusy(null);
    }
  }

  const usagePercent =
    subscription?.meetingSecondsLimit && subscription.meetingSecondsLimit > 0
      ? Math.min(
          100,
          Math.round((subscription.meetingSecondsUsed / subscription.meetingSecondsLimit) * 100),
        )
      : null;

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Billing</h1>
        <p className="mt-1 text-sm text-neutral-500">Your plan, usage, and payment settings.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {!subscription ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="sm:col-span-2 lg:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Current plan
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight text-neutral-950">
                      {subscription.planName}
                    </h2>
                    <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
                  </div>
                  {subscription.planId === "trial" && subscription.trialEndsAt && (
                    <p className="mt-2 text-sm text-neutral-500">
                      Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()} ·{" "}
                      {subscription.trialMeetingsUsed}/{subscription.trialMeetingCap} meetings used
                    </p>
                  )}
                </div>
                {subscription.planId !== "trial" && (
                  <Button
                    variant="secondary"
                    onClick={() => void openPortal()}
                    disabled={busy === "portal"}
                  >
                    Manage subscription
                  </Button>
                )}
              </div>

              {usagePercent !== null && (
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-neutral-600">
                    <span>Meeting hours this period</span>
                    <span className="font-medium text-neutral-900">
                      {hoursLabel(subscription.meetingSecondsUsed)} /{" "}
                      {hoursLabel(subscription.meetingSecondsLimit!)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usagePercent > 90 ? "bg-amber-500" : "bg-brand-500"
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Tips</p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Use{" "}
                <span className="font-medium text-neutral-900">Let me choose per meeting</span> in
                Settings to skip low-value calls and stretch your hours.
              </p>
              <Button href="/dashboard/settings" variant="secondary" className="mt-4">
                Open join settings
              </Button>
            </Card>
          </div>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
                {subscription.planId === "trial" ? "Choose your plan" : "Change plan"}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Upgrade or switch anytime. Changes are handled securely through Stripe.
              </p>
            </div>

            {!plans ? (
              <Spinner />
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {plans.map((plan) => {
                  const meta = PLAN_META[plan.id] ?? {
                    blurb: "",
                    hoursLabel:
                      plan.meetingHoursPerMonth == null
                        ? "Unlimited hours"
                        : `${plan.meetingHoursPerMonth} hours / month`,
                  };
                  const current = plan.id === subscription.planId;
                  const featured = Boolean(meta.featured) && !current;

                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white p-6 ${
                        current
                          ? "border-brand-300 shadow-[0_0_0_1px_rgba(255,0,52,0.12)]"
                          : featured
                            ? "border-neutral-200 shadow-sm ring-1 ring-brand-100"
                            : "border-neutral-200"
                      }`}
                    >
                      {featured && (
                        <span className="absolute top-4 right-4 rounded-md bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Popular
                        </span>
                      )}
                      {current && (
                        <span className="absolute top-4 right-4 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          Current
                        </span>
                      )}

                      <div className="pr-16">
                        <h3 className="text-lg font-bold tracking-tight text-neutral-950">
                          {plan.name}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-500">{meta.blurb}</p>
                      </div>

                      <div className="mt-5 flex items-baseline gap-1">
                        <span className="text-4xl font-bold tracking-tight text-neutral-950">
                          ${(plan.priceMonthlyCents / 100).toFixed(0)}
                        </span>
                        <span className="text-sm text-neutral-500">/month</span>
                      </div>

                      <p className="mt-2 text-sm font-medium text-brand-600">{meta.hoursLabel}</p>

                      <ul className="mt-6 flex-1 space-y-2.5 border-t border-neutral-100 pt-5">
                        {plan.highlights.map((h) => (
                          <li key={h} className="flex gap-2 text-sm text-neutral-600">
                            <span className="mt-0.5 text-brand-500" aria-hidden>
                              ✓
                            </span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        onClick={() => void checkout(plan.id)}
                        disabled={busy !== null || current}
                        className="mt-6 w-full"
                        variant={featured || current ? "primary" : "secondary"}
                      >
                        {current
                          ? "Current plan"
                          : busy === plan.id
                            ? "Redirecting…"
                            : subscription.planId === "trial"
                              ? "Start plan"
                              : "Switch to this plan"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
