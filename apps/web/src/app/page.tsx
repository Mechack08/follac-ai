import Link from "next/link";

const features = [
  {
    title: "A notetaker in every meeting",
    body: "Follac's bot joins your Google Meet, Zoom, and Teams calls automatically via your calendar — or on demand with a link.",
  },
  {
    title: "Who said what, exactly",
    body: "Diarized transcripts attribute every sentence to its speaker, with talk-time analytics per participant.",
  },
  {
    title: "Decisions & action items",
    body: "Every meeting ends with a clear list of decisions made and who committed to what, with due dates when mentioned.",
  },
  {
    title: "Reports in your inbox",
    body: "Minutes after the call, get an executive summary and a full report by email. Configure exactly what you receive.",
  },
  {
    title: "Assistant in your browser",
    body: "The Follac extension helps you draft replies in Gmail, edit in Docs, and research on LinkedIn — with your approval, always.",
  },
  {
    title: "API for your workflow",
    body: "Pull transcripts and action items into your own tools with a clean REST API and webhooks on the Business plan.",
  },
];

const steps = [
  { n: "1", title: "Connect your calendar", body: "One click. Follac spots meetings with video links automatically." },
  { n: "2", title: "Meet as usual", body: "Our notetaker joins with you, announces itself, and records." },
  { n: "3", title: "Get the report", body: "Summary, decisions, and action items land in your inbox minutes later." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-xl font-bold text-brand-600">Follac AI</span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Pricing
          </Link>
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

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-600">
          Follow → Understand → Act
        </p>
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-gray-900">
          Never take meeting notes again.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          Follac joins your meetings, writes down who said what, extracts every decision and
          action item, and emails the report before you&apos;re back at your desk.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
          >
            Try free for 7 days
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
          >
            See pricing
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-500">No credit card required · 5 meetings included</p>
      </section>

      {/* How it works */}
      <section className="border-y border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Your first report in under two minutes
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
                  {step.n}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold text-gray-900">
          A full assistant for your workday
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white">Stop losing what was said</h2>
          <p className="mt-3 text-brand-100">
            7 days free, full features, no card. Upgrade only if it earns its keep.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            Start your free trial
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-gray-500">
        <span>© {new Date().getFullYear()} Follac AI</span>
        <div className="flex gap-6">
          <Link href="/pricing" className="hover:text-gray-900">Pricing</Link>
          <Link href="/docs/api" className="hover:text-gray-900">API</Link>
          <Link href="/login" className="hover:text-gray-900">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
