"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import { sendPasswordSetupEmail } from "@/lib/client/firebase";

interface FacilitySummary {
  id: string;
  name: string;
  createdAt: string | null;
  createdBy: string | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "—";

/** 運営者向け: 新しい施設を追加し、最初の管理者を招待する */
export default function OperatorPage() {
  const { api, me } = useAuth();
  const [list, setList] = useState<FacilitySummary[] | null>(null);
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "alert"; text: string } | null>(null);

  const load = useCallback(() => {
    api<{ facilities: FacilitySummary[] }>("/api/operator/facilities")
      .then((r) => setList(r.facilities))
      .catch((e) => setMsg({ tone: "alert", text: e.message }));
  }, [api]);
  useEffect(() => {
    if (me?.operator) load();
  }, [me?.operator, load]);

  if (me && !me.operator) return <Notice tone="alert">この画面は運営者だけが使えます。</Notice>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ adminEmail: string }>("/api/operator/facilities", {
        method: "POST",
        body: JSON.stringify({ name, adminEmail }),
      });
      try {
        await sendPasswordSetupEmail(r.adminEmail);
        setMsg({ tone: "info", text: `「${name}」を追加し、${r.adminEmail} にパスワード設定のメールを送りました。` });
      } catch {
        setMsg({
          tone: "alert",
          text: `「${name}」は追加しましたが、${r.adminEmail} へのメールを送れませんでした。管理者の方に、ログイン画面の「パスワードを忘れた方」から設定してもらってください。`,
        });
      }
      setName("");
      setAdminEmail("");
      load();
    } catch (e) {
      setMsg({ tone: "alert", text: e instanceof Error ? e.message : "追加できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-[24px] font-bold">施設の追加</h1>
      <p className="mb-6 text-[14px] text-ink-soft">
        運営者だけが使える画面です。新しい施設を追加すると、施設の管理者にパスワード設定のメールが届きます。管理者は、ログイン後に受け入れ設定とスタッフの招待をします。
      </p>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border-2 border-brand-soft bg-sheet p-5 shadow-card sm:p-6">
        <Field label="施設名" hint="家族アンケートや同意書の文案に表示されます。あとから受け入れ設定で変えられます。">
          <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：ひだまりの家" />
        </Field>
        <Field label="施設の管理者のメールアドレス">
          <Input type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        </Field>
        <Button type="submit" busy={busy}>
          施設を追加して招待メールを送る
        </Button>
      </form>

      {msg && (
        <div className="mt-5">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <section className="mt-6 rounded-3xl bg-sheet p-5 shadow-card sm:p-6">
        <h2 className="mb-3 text-[18px] font-bold">施設の一覧</h2>
        {list === null ? (
          <p className="text-mute">読み込み中…</p>
        ) : list.length === 0 ? (
          <p className="text-ink-soft">まだ施設がありません。</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-4 py-3">
                <span className="min-w-0 flex-1 text-[15px] font-bold">{f.name || "（施設名なし）"}</span>
                <span className="text-[12px] text-mute">ID：{f.id}</span>
                <span className="text-[12px] text-mute">
                  {fmt(f.createdAt)} 追加{f.createdBy && `（${f.createdBy}）`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
