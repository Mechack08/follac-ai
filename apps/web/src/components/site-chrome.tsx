import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight } from "@/components/landing-icons";

export function SiteHeader({ ctaHref = "/signup", ctaLabel = "Start free" }: { ctaHref?: string; ctaLabel?: string }) {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-[1.35rem] font-bold tracking-tight text-brand-500">
        Follac
      </Link>
      <nav className="flex items-center gap-1 sm:gap-6">
        <Link
          href="/pricing"
          className="hidden text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 sm:inline"
        >
          Pricing
        </Link>
        <Link
          href="/login"
          className="px-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 sm:px-0"
        >
          Sign in
        </Link>
        <Link
          href={ctaHref}
          className="ml-1 inline-flex items-center rounded-md bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          {ctaLabel}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-bold tracking-tight text-brand-500">Follac</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
            A work assistant for meetings, email, documents, and LinkedIn. Follow, understand, act.
          </p>
        </div>
        <div className="flex gap-12 text-sm">
          <div>
            <p className="font-semibold text-neutral-900">Product</p>
            <ul className="mt-3 space-y-2 text-neutral-500">
              <li>
                <Link href="/pricing" className="transition-colors hover:text-neutral-900">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/docs/api" className="transition-colors hover:text-neutral-900">
                  API
                </Link>
              </li>
              <li>
                <Link href="/signup" className="transition-colors hover:text-neutral-900">
                  Free trial
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Account</p>
            <ul className="mt-3 space-y-2 text-neutral-500">
              <li>
                <Link href="/login" className="transition-colors hover:text-neutral-900">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="transition-colors hover:text-neutral-900">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Follac. All rights reserved.</span>
          <span>Follow · Understand · Act</span>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-neutral-900">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,#fff1f3,transparent_55%),linear-gradient(180deg,#fafafa_0%,#ffffff_40%)]"
      />
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}

export function PageCta({
  title,
  body,
  primaryHref = "/signup",
  primaryLabel = "Start free trial",
}: {
  title: string;
  body: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-[linear-gradient(135deg,#fff_0%,#fff1f3_100%)] px-8 py-12 text-center sm:px-16 sm:py-16">
        <h2 className="mx-auto max-w-xl text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-500">{body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={primaryHref}
            className="inline-flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            {primaryLabel}
            <IconArrowRight />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
