"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button, Input } from "@/components/ui";
import { IconGoogle } from "@/components/landing-icons";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signUp.email({ name, email, password });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Sign up failed");
      return;
    }
    router.push("/dashboard?welcome=1");
  }

  async function handleGoogle() {
    await signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/dashboard?welcome=1`,
    });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,#fff1f3,transparent_55%),linear-gradient(180deg,#fafafa_0%,#ffffff_40%)]"
      />
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-2xl font-bold tracking-tight text-brand-500">
          Follac
        </Link>
        <div className="rounded-xl border border-neutral-200/90 bg-white p-8">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950">
            Start your 7-day free trial
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Meetings, browser assist, and reports. No credit card.
          </p>
          <Button variant="secondary" onClick={handleGoogle} className="mt-6 w-full">
            <IconGoogle />
            Continue with Google
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-neutral-400">
            <div className="h-px flex-1 bg-neutral-200" /> or <div className="h-px flex-1 bg-neutral-200" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Work email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
