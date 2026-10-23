"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/client/auth";
import { Button, Notice, cx } from "@/components/ui";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<p className="p-8 text-mute">読み込み中…</p>}>
        <Shell>{children}</Shell>
      </Suspense>
    </AuthProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, me, loading, error, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <p className="p-8 text-mute">読み込み中…</p>;
  }

  const nav = [
    { href: "/residents", label: "入居者" },
    { href: "/settings", label: "受け入れ設定" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-sheet">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/residents" className="flex items-baseline gap-2">
            <span className="font-mincho text-[22px] tracking-wide text-indigo">Hotalink</span>
            {me?.facilityName && <span className="text-[13px] text-ink-soft">{me.facilityName}</span>}
          </Link>
          <nav className="flex gap-1" aria-label="メインメニュー">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                className={cx(
                  "rounded-md px-3 py-1.5 text-[14px]",
                  pathname.startsWith(n.href) ? "bg-glow-soft font-semibold text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px] text-mute">
            <span className="hidden sm:inline">{me?.email}</span>
            <Button variant="quiet" className="min-h-9 px-3 text-[13px]" onClick={logout}>
              ログアウト
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? <Notice tone="alert">{error}</Notice> : me && !me.aiEnabled ? (
          <div className="mb-6">
            <Notice>AI が未設定のため、資料の読み取りはダミーで動いています。ANTHROPIC_API_KEY を設定すると Claude が資料を読み取ります。</Notice>
          </div>
        ) : null}
        {!error && children}
      </main>
    </div>
  );
}
