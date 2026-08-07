"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Plan } from "@/lib/api";
import { Spinner } from "@/components/ui";

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/billing/plans")
      .then((res) => setPlans(res.plans.sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch(() => setPlans([]));
  }, []);

  return (
    <main className="min-h-screen bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-bold text-brand-600">
          Follac AI
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Start free trial
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-center text-4xl font-bold text-gray-900">
          Pay for what Follac saves you
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-gray-600">
          Every plan starts with a 7-day free trial of full Pro features. No credit card required.
        </p>

        {!plans ? (
          <Spinner />
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isPro = plan.id === "pro";
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-2xl border p-6 ${
                    isPro
                      ? "border-brand-600 shadow-lg shadow-brand-600/10 ring-1 ring-brand-600"
                      : "border-gray-200"
                  }`}
                >
                  {isPro && (
                    <span className="mb-2 self-start rounded-full bg-brand-100 px-3 py-0.5 text-xs font-semibold text-brand-700">
                      Most popular
                    </span>
                  )}
                  <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
                  <p className="mt-2">
                    <span className="text-4xl font-bold text-gray-900">
                      ${(plan.priceMonthlyCents / 100).toFixed(0)}
                    </span>
                    {plan.priceMonthlyCents > 0 && (
                      <span className="text-sm text-gray-500">/month</span>
                    )}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-2 text-sm text-gray-600">
                        <span className="text-brand-600">✓</span>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${
                      isPro
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
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
    </main>
  );
}
