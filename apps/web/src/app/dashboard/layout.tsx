"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { Spinner } from "@/components/ui";

const nav = [
  { href: "/dashboard", label: "Meetings" },
  { href: "/dashboard/actions", label: "Action items" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/developer", label: "Developer" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner />
      </main>
    );
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-lg font-bold text-brand-600">
              Follac AI
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {nav.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard" || pathname.startsWith("/dashboard/meetings")
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:block">{session.user.email}</span>
            <button
              onClick={() => void signOut().then(() => router.push("/"))}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
