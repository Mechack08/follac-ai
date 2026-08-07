"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button, Input } from "@/components/ui";
import { IconGoogle } from "@/components/landing-icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.email({ email, password });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Sign in failed");
      return;
    }
    router.push("/dashboard");
  }

  async function handleGoogle() {
    await signIn.social({ provider: "google", callbackURL: `${window.location.origin}/dashboard` });
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
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950">Welcome back</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to your workspace.</p>
          <Button variant="secondary" onClick={handleGoogle} className="mt-6 w-full">
            <IconGoogle />
            Continue with Google
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-neutral-400">
            <div className="h-px flex-1 bg-neutral-200" /> or <div className="h-px flex-1 bg-neutral-200" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-neutral-600">
          New to Follac?{" "}
          <Link href="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
            Start your free trial
          </Link>
        </p>
      </div>
    </main>
  );
}
