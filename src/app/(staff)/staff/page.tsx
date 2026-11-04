"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, Segmented, cx } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import { sendPasswordSetupEmail } from "@/lib/client/firebase";

interface StaffAccount {
  uid: string;
  email: string;
  role: "admin" | "staff";
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "まだなし";

const ROLE_LABELS = { admin: "管理者", staff: "スタッフ" } as const;

export default function StaffPage() {
  const { api, me } = useAuth();
  const [list, setList] = useState<StaffAccount[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "alert"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ staff: StaffAccount[] }>("/api/staff")
      .then((r) => setList(r.staff))
      .catch((e) => setMsg({ tone: "alert", text: e.message }));
  }, [api]);
  useEffect(load, [load]);

  if (me && me.role !== "admin") {
    return <Notice tone="alert">スタッフの管理は、施設の管理者だけが行えます。</Notice>;
  }

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ tone: "info", text: await fn() });
      load();
    } catch (e) {
      setMsg({ tone: "alert", text: e instanceof Error ? e.message : "うまくいきませんでした" });
    } finally {
      setBusy(null);
    }
  }

  const resend = (s: StaffAccount) =>
    run(`mail-${s.uid}`, async () => {
      await sendPasswordSetupEmail(s.email);
      return `${s.email} に、パスワード設定のメールを送りました。`;
    });
  const setRole = (s: StaffAccount, role: StaffAccount["role"]) =>
    run(`role-${s.uid}`, async () => {
      await api(`/api/staff/${s.uid}`, { method: "PATCH", body: JSON.stringify({ role }) });
      return `${s.email} の権限を「${ROLE_LABELS[role]}」にしました。次にログインしたときから変わります。`;
    });
  const setDisabled = (s: StaffAccount, disabled: boolean) =>
    run(`dis-${s.uid}`, async () => {
      if (disabled && !confirm(`${s.email} を停止しますか？ ログイン中の端末からも使えなくなります。`)) return "停止を取りやめました。";
      await api(`/api/staff/${s.uid}`, { method: "PATCH", body: JSON.stringify({ disabled }) });
      return disabled ? `${s.email} を停止しました。` : `${s.email} を使えるように戻しました。`;
    });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-[24px] font-bold">スタッフ管理</h1>
      <p className="mb-6 text-[14px] text-ink-soft">
        この施設でアプリを使うスタッフを招待します。招待した人には、パスワードを設定するためのメールが届きます。
      </p>

      <InviteForm
        onInvited={(text) => {
          setMsg({ tone: "info", text });
          load();
        }}
      />

      {msg && (
        <div className="mt-5">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <section className="mt-6 rounded-3xl bg-sheet p-5 shadow-card sm:p-6">
        <h2 className="mb-3 text-[18px] font-bold">スタッフ一覧</h2>
        {list === null ? (
          <p className="text-mute">読み込み中…</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => {
              const self = s.email === me?.email;
              return (
                <li key={s.uid} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={cx("truncate text-[15px] font-bold", s.disabled && "text-mute line-through")}>
                      {s.email}
                      {self && <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-[12px] text-brand-strong">あなた</span>}
                      {s.disabled && <span className="ml-2 rounded-full bg-alert-soft px-2 py-0.5 text-[12px] text-alert no-underline">停止中</span>}
                    </p>
                    <p className="text-[12px] text-mute">
                      最後のログイン：{fmt(s.lastSignInAt)}
                    </p>
                  </div>
                  {self ? (
                    <span className="text-[14px] font-bold text-ink-soft">{ROLE_LABELS[s.role]}</span>
                  ) : (
                    <Segmented<StaffAccount["role"]>
                      label={`${s.email} の権限`}
                      value={s.role}
                      onChange={(v) => v !== s.role && setRole(s, v)}
                      options={[
                        { value: "staff", label: "スタッフ" },
                        { value: "admin", label: "管理者" },
                      ]}
                    />
                  )}
                  {!self && (
                    <div className="flex gap-1">
                      {!s.disabled && (
                        <Button variant="quiet" className="min-h-9 px-3 text-[13px]" busy={busy === `mail-${s.uid}`} onClick={() => resend(s)}>
                          パスワード設定メール
                        </Button>
                      )}
                      <Button
                        variant={s.disabled ? "quiet" : "danger"}
                        className="min-h-9 px-3 text-[13px]"
                        busy={busy === `dis-${s.uid}`}
                        onClick={() => setDisabled(s, !s.disabled)}
                      >
                        {s.disabled ? "使えるように戻す" : "停止"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-mute">
          管理者は、受け入れ設定の変更とスタッフの管理ができます。スタッフは、入居者の登録から判定までができます。
        </p>
      </section>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: (text: string) => void }) {
  const { api } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string; created: boolean }>("/api/staff", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      try {
        await sendPasswordSetupEmail(r.email);
      } catch {
        onInvited(`${r.email} を招待しましたが、メールを送れませんでした。一覧の「パスワード設定メール」からもう一度送ってください。`);
        return;
      }
      onInvited(
        r.created
          ? `${r.email} を招待しました。パスワード設定のメールが届くので、設定してからログインしてもらってください。`
          : `${r.email} はすでにアカウントがあったので、この施設に「${ROLE_LABELS[role]}」として追加し、パスワード設定のメールを送りました。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "招待できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border-2 border-brand-soft bg-sheet p-5 shadow-card sm:p-6">
      <h2 className="mb-3 text-[18px] font-bold">スタッフを招待</h2>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="メールアドレス">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例：yamada@example.jp" />
        </Field>
        <div>
          <span className="mb-1 block text-[13px] font-semibold text-ink-soft">権限</span>
          <Segmented<"admin" | "staff">
            label="権限"
            value={role}
            onChange={setRole}
            options={[
              { value: "staff", label: "スタッフ" },
              { value: "admin", label: "管理者" },
            ]}
          />
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Notice tone="alert">{error}</Notice>
        </div>
      )}
      <Button type="submit" busy={busy} className="mt-4">
        招待メールを送る
      </Button>
    </form>
  );
}
