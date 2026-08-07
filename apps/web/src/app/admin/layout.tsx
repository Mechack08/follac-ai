"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { Spinner } from "@/components/ui";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/pipeline", label: "Pipeline health" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const role = (session?.user as { role?: string } | undefined)?.role;

  useEffect(() => {
    if (!isPending && (!session || role !== "admin")) router.replace("/dashboard");
  }, [isPending, session, role, router]);

  if (isPending || !session || role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold text-amber-800">Follac Admin</span>
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active =
                  item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      active ? "bg-amber-100 text-amber-900" : "text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-amber-800 hover:underline">
            ← Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
