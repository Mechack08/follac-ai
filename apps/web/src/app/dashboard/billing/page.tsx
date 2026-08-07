"use client";

import { useEffect, useState } from "react";
import { api, type Plan, type Subscription } from "@/lib/api";
import { Badge, Button, Card, Spinner, statusTone } from "@/components/ui";

function hoursLabel(seconds: number): string {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Subscription>("/api/billing/subscription").then(setSubscription).catch(() => null);
    api<{ plans: Plan[] }>("/api/billing/plans")
      .then((res) =>
        setPlans(res.plans.filter((p) => p.priceMonthlyCents > 0).sort((a, b) => a.sortOrder - b.sortOrder)),
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

  if (!subscription) return <Spinner />;

  const usagePercent =
    subscription.meetingSecondsLimit && subscription.meetingSecondsLimit > 0
      ? Math.min(100, Math.round((subscription.meetingSecondsUsed / subscription.meetingSecondsLimit) * 100))
      : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Your plan, usage, and payment settings.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{subscription.planName}</h2>
              <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
            </div>
            {subscription.planId === "trial" && subscription.trialEndsAt && (
              <p className="mt-1 text-sm text-gray-500">
                Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()} ·{" "}
                {subscription.trialMeetingsUsed}/{subscription.trialMeetingCap} meetings used
              </p>
            )}
          </div>
          {subscription.planId !== "trial" && (
            <Button variant="secondary" onClick={() => void openPortal()} disabled={busy === "portal"}>
              Manage subscription
            </Button>
          )}
        </div>

        {usagePercent !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Meeting hours this period</span>
              <span>
                {hoursLabel(subscription.meetingSecondsUsed)} /{" "}
                {hoursLabel(subscription.meetingSecondsLimit!)}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${usagePercent > 90 ? "bg-red-500" : "bg-brand-500"}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          {subscription.planId === "trial" ? "Choose your plan" : "Change plan"}
        </h2>
        {!plans ? (
          <Spinner />
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={plan.id === subscription.planId ? "ring-2 ring-brand-600" : ""}>
                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  ${(plan.priceMonthlyCents / 100).toFixed(0)}
                  <span className="text-sm font-normal text-gray-500">/mo</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {plan.highlights.slice(0, 4).map((h) => (
                    <li key={h} className="text-xs text-gray-600">
                      ✓ {h}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => void checkout(plan.id)}
                  disabled={busy !== null || plan.id === subscription.planId}
                  className="mt-4 w-full"
                  variant={plan.id === "pro" ? "primary" : "secondary"}
                >
                  {plan.id === subscription.planId
                    ? "Current plan"
                    : busy === plan.id
                      ? "Redirecting…"
                      : "Upgrade"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
