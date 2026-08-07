"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button, Input } from "@/components/ui";

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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-2xl font-bold text-brand-600">
          Follac AI
        </Link>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Start your 7-day free trial</h1>
          <p className="mt-1 text-sm text-gray-500">Full Pro features. No credit card.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
          <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200" /> or <div className="h-px flex-1 bg-gray-200" />
          </div>
          <Button variant="secondary" onClick={handleGoogle} className="w-full">
            Continue with Google
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
