"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Plan } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { MarketingShell, PageCta } from "@/components/site-chrome";

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/billing/plans")
      .then((res) => setPlans(res.plans.sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch(() => setPlans([]));
  }, []);

  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            Pay for what Follac saves you
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            Every plan starts with a 7-day free trial of full Pro features. No credit card required.
            Meetings, browser assist, and reports included by tier.
          </p>
        </div>

        {!plans ? (
          <Spinner />
        ) : (
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isPro = plan.id === "pro";
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-xl border bg-white p-6 ${
                    isPro
                      ? "border-brand-500 ring-1 ring-brand-500"
                      : "border-neutral-200/90"
                  }`}
                >
                  {isPro && (
                    <span className="mb-3 self-start rounded-md bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                      Most popular
                    </span>
                  )}
                  <h2 className="text-base font-semibold text-neutral-900">{plan.name}</h2>
                  <p className="mt-2">
                    <span className="text-3xl font-bold tracking-tight text-neutral-950">
                      ${(plan.priceMonthlyCents / 100).toFixed(0)}
                    </span>
                    {plan.priceMonthlyCents > 0 && (
                      <span className="text-sm text-neutral-500">/month</span>
                    )}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {plan.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-2 text-sm text-neutral-600">
                        <span className="mt-0.5 text-brand-500" aria-hidden>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path
                              d="M3 7.2l2.5 2.5L11 4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                      isPro
                        ? "bg-brand-500 text-white hover:bg-brand-600"
                        : "border border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    {plan.priceMonthlyCents === 0 ? "Start free" : "Start trial"}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PageCta
        title="Try the full product for a week."
        body="Meeting notes, in-page assist, and email reports. Keep a plan only if it earns its place."
      />
    </MarketingShell>
  );
}
