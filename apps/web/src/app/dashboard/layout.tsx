"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { Spinner } from "@/components/ui";

const nav = [
  { href: "/dashboard", label: "Meetings" },
  { href: "/dashboard/actions", label: "Action items" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/developer", label: "Developer" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/meetings");
  }
  return pathname.startsWith(href);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // While signing out we hard-navigate; don't fight it with soft redirects
    if (leaving) return;
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router, leaving]);

  async function handleSignOut() {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      // Hard navigation avoids the soft-router race where session clears,
      // the layout mounts a full-page spinner, and isPending never settles.
      window.location.assign("/");
    }
  }

  if (leaving || isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </main>
    );
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,#fff1f3,transparent),#fafafa] text-neutral-900">
      <header className="sticky top-0 z-20 shrink-0 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-lg font-bold tracking-tight text-brand-500">
                Follac
              </Link>
              <nav className="hidden items-center gap-1 md:flex">
                {nav.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                  >
                    Admin
                  </Link>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden truncate text-sm text-neutral-500 sm:block">
                {session.user.email}
              </span>
              <button
                onClick={() => void handleSignOut()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                Sign out
              </button>
            </div>
          </div>
          <nav className="-mx-2 flex gap-1 overflow-x-auto border-t border-neutral-100 py-2 md:hidden">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brand-50 text-brand-700" : "text-neutral-600"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div className="w-full min-w-0">{children}</div>
      </main>
    </div>
  );
}
