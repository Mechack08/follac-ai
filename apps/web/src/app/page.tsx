import Link from "next/link";
import {
  IconArrowRight,
  IconBrowser,
  IconCalendar,
  IconCheckList,
  IconMail,
  IconMic,
  IconPen,
  IconShield,
  IconUsers,
} from "@/components/landing-icons";
import { MarketingShell, PageCta } from "@/components/site-chrome";

const pillars = [
  {
    icon: IconMic,
    title: "Meetings",
    body: "A notetaker joins Google Meet, Zoom, and Teams. You get who said what, decisions, and action items in your inbox.",
  },
  {
    icon: IconBrowser,
    title: "In your browser",
    body: "On Gmail, Google Docs, and LinkedIn, Follac reads the moment and suggests drafts or research. You approve before anything is written.",
  },
];

const capabilities = [
  {
    icon: IconMic,
    title: "Joins the call for you",
    body: "Connect your calendar once. Follac shows up on time for Meet, Zoom, and Teams, or join from a pasted link.",
  },
  {
    icon: IconUsers,
    title: "Knows who said what",
    body: "Speaker-aware transcripts so you can return to the exact moment a decision was made, not a wall of text.",
  },
  {
    icon: IconPen,
    title: "Drafts where you already work",
    body: "Suggests replies in Gmail, rewrites in Docs, and outreach or research on LinkedIn. Nothing sends without your OK.",
  },
  {
    icon: IconCheckList,
    title: "Surfaces what matters",
    body: "Decisions, owners, and due dates from meetings. Tasks and context from email and documents when you need them.",
  },
  {
    icon: IconMail,
    title: "Reports when the call ends",
    body: "A short summary and a full write-up, minutes later. Ready to forward to anyone who missed the meeting.",
  },
  {
    icon: IconShield,
    title: "You stay in control",
    body: "The meeting bot announces itself. Browser actions need your approval. Reports go to you until you share them.",
  },
];

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--color-brand-500)_10%,transparent),transparent_70%)]"
      />
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_24px_80px_-32px_rgba(17,17,17,0.35)]">
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="ml-3 text-xs font-medium text-neutral-400">
            Today across Follac
          </span>
        </div>
        <div className="grid gap-0 md:grid-cols-2">
          <div className="space-y-4 border-b border-neutral-100 p-5 md:border-b-0 md:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Meeting report
            </p>
            <p className="text-sm font-medium text-neutral-900">Q3 roadmap review</p>
            <p className="text-sm leading-relaxed text-neutral-600">
              Billing portal ships in September. Support owns migration emails. API freeze on Friday.
            </p>
            <ul className="space-y-2">
              {[
                { who: "Maya", task: "Draft migration email" },
                { who: "Jon", task: "Freeze API schema" },
              ].map((item) => (
                <li key={item.task} className="flex items-start gap-2.5 text-sm text-neutral-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-brand-200 bg-brand-50 text-brand-500">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path
                        d="M2 5.2l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <span className="font-medium text-neutral-900">{item.who}</span>
                    <span className="text-neutral-400"> · </span>
                    {item.task}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              In-page suggestions
            </p>
            {[
              { where: "Gmail", action: "Draft a reply that matches the thread tone" },
              { where: "Docs", action: "Tighten the selected paragraph" },
              { where: "LinkedIn", action: "Research the company on this job post" },
            ].map((row) => (
              <div
                key={row.where}
                className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5"
              >
                <p className="text-[11px] font-semibold text-brand-600">{row.where}</p>
                <p className="mt-0.5 text-sm text-neutral-700">{row.action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pb-24 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="animate-rise text-[2.5rem] font-bold leading-[1.1] tracking-tight text-neutral-950 sm:text-5xl md:text-[3.4rem]">
            Follac
          </h1>
          <p className="animate-rise-late mt-5 text-xl font-medium leading-snug text-neutral-800 sm:text-2xl">
            The assistant that works where you work.
          </p>
          <p className="animate-rise-later mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-neutral-500 sm:text-base">
            Capture meetings, draft in Gmail and Docs, and research on LinkedIn. Follac follows
            context and helps you act, always with your approval.
          </p>
          <div className="animate-rise-later mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Try 7 days free
              <IconArrowRight />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-md border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              View pricing
            </Link>
          </div>
          <p className="animate-rise-later mt-4 text-xs text-neutral-400">
            No card required · Cancel anytime
          </p>
        </div>

        <div className="animate-rise-later mt-14 sm:mt-16">
          <ProductPreview />
        </div>
      </section>

      <section className="border-y border-neutral-100 bg-white/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <p className="text-sm text-neutral-500">Works with the tools your team already uses</p>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm font-semibold tracking-tight text-neutral-700">
            {["Google Meet", "Zoom", "Teams", "Gmail", "Docs", "LinkedIn"].map((name, i) => (
              <span key={name} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-neutral-300">·</span>}
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Two surfaces. One assistant.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
            Meetings get a full record. Your browser gets help in the moment. Same product, same
            standards.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {pillars.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-neutral-200/90 bg-white p-6 transition-colors hover:border-neutral-300"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                <item.icon />
              </div>
              <h3 className="mt-4 text-base font-semibold text-neutral-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-100 bg-neutral-50/80 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              What Follac actually does
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
              Built for people who live in calls, inboxes, and documents all week.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-neutral-200/90 bg-white p-6 transition-colors hover:border-neutral-300"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                  <item.icon />
                </div>
                <h3 className="mt-4 text-base font-semibold text-neutral-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Simple to start. Hard to work without.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
            Set up once. After that, Follac stays out of the way until you need it.
          </p>
        </div>
        <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10">
          {[
            {
              icon: IconCalendar,
              title: "Connect and install",
              body: "Link your calendar and add the Chrome extension. Takes a couple of minutes.",
            },
            {
              icon: IconBrowser,
              title: "Work as usual",
              body: "Follac joins meetings when needed and suggests help on Gmail, Docs, and LinkedIn.",
            },
            {
              icon: IconMail,
              title: "Review and approve",
              body: "Open reports after calls. Run in-page actions only when you click through.",
            },
          ].map((step, i) => (
            <li key={step.title}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-brand-500">
                  <step.icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold tabular-nums text-neutral-400">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-neutral-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-neutral-100 bg-neutral-50/80 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Why teams keep paying for it
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
              Lost commitments, rewritten notes, and half-finished drafts cost more than a seat.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Less time reconstructing work",
                body: "Meeting notes and suggested drafts show up when you need them, so you move on instead of reconstructing.",
              },
              {
                title: "Fewer things that slip",
                body: "Action items with owners from calls. Clear next steps from email and docs when you ask for help.",
              },
              {
                title: "One place that remembers",
                body: "Search past meetings, share a report, or pull action items into your tools. The record lives in Follac.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-neutral-200/90 bg-white p-6"
              >
                <h3 className="text-base font-semibold text-neutral-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PageCta
        title="Your next hour of work can run with backup."
        body="Start with a full week free. Keep Follac only if it earns a seat on your team."
      />
    </MarketingShell>
  );
}
