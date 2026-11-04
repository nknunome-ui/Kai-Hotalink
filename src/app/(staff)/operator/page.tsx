"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, cx } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import { SetupLink } from "@/components/SetupLink";
import { sendPasswordSetupEmail } from "@/lib/client/firebase";

interface FacilitySummary {
  id: string;
  name: string;
  createdAt: string | null;
  createdBy: string | null;
  admins: { uid: string; email: string; disabled: boolean; lastSignInAt: string | null }[];
}

type Msg = { tone: "info" | "alert"; text: string; link?: { email: string; link: string } };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "—";

/** メールを送り、届かないとき用にパスワード設定用のリンクも出す */
async function sendSetup(email: string, done: string, link: string): Promise<Msg> {
  try {
    await sendPasswordSetupEmail(email);
    return {
      tone: "info",
      text: `${done}${email} にパスワード設定のメールを送りました。届かないときは、下のリンクを本人に送ってください。`,
      link: { email, link },
    };
  } catch {
    return { tone: "alert", text: `${done}${email} へのメールを送れませんでした。下のリンクを本人に送ってください。`, link: { email, link } };
  }
}

/** 運営者向け: 施設の一覧・追加と、施設の管理者の追加 */
export default function OperatorPage() {
  const { api, me } = useAuth();
  const [list, setList] = useState<FacilitySummary[] | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  const load = useCallback(() => {
    api<{ facilities: FacilitySummary[] }>("/api/operator/facilities")
      .then((r) => setList(r.facilities))
      .catch((e) => setMsg({ tone: "alert", text: e.message }));
  }, [api]);
  useEffect(() => {
    if (me?.operator) load();
  }, [me?.operator, load]);

  if (me && !me.operator) return <Notice tone="alert">この画面は運営者だけが使えます。</Notice>;

  const report = (m: Msg) => {
    setMsg(m);
    load();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-[24px] font-bold">施設管理</h1>
      <p className="mb-6 text-[14px] text-ink-soft">
        HotaLink を使う施設の追加と、施設の管理者の招待をします。施設の管理者は、ログイン後に受け入れ設定とスタッフの招待をします。
      </p>

      <AddFacilityForm onDone={report} />

      {msg && (
        <div className="mt-5 space-y-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
          {msg.link && <SetupLink email={msg.link.email} link={msg.link.link} onClose={() => setMsg(null)} />}
        </div>
      )}

      <section className="mt-6 rounded-3xl bg-sheet p-5 shadow-card sm:p-6">
        <h2 className="mb-3 text-[18px] font-bold">施設の一覧{list && `（${list.length}施設）`}</h2>
        {list === null ? (
          <p className="text-mute">読み込み中…</p>
        ) : list.length === 0 ? (
          <p className="text-ink-soft">まだ施設がありません。</p>
        ) : (
          <ul className="space-y-3">
            {list.map((f) => (
              <FacilityRow key={f.id} f={f} onDone={report} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddFacilityForm({ onDone }: { onDone: (m: Msg) => void }) {
  const { api } = useAuth();
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ adminEmail: string; link: string }>("/api/operator/facilities", {
        method: "POST",
        body: JSON.stringify({ name, adminEmail }),
      });
      onDone(await sendSetup(r.adminEmail, `「${name}」を追加しました。`, r.link));
      setName("");
      setAdminEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border-2 border-brand-soft bg-sheet p-5 shadow-card sm:p-6">
      <h2 className="text-[18px] font-bold">施設を追加</h2>
      <Field label="施設名" hint="家族アンケートや同意書の文案に表示されます。あとから施設の管理者が受け入れ設定で変えられます。">
        <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：ひだまりの家" />
      </Field>
      <Field label="施設の管理者のメールアドレス">
        <Input type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
      </Field>
      {error && <Notice tone="alert">{error}</Notice>}
      <Button type="submit" busy={busy}>
        施設を追加して招待メールを送る
      </Button>
    </form>
  );
}

function FacilityRow({ f, onDone }: { f: FacilitySummary; onDone: (m: Msg) => void }) {
  const { api } = useAuth();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      const r = await api<{ email: string; link: string }>(`/api/operator/facilities/${f.id}/admins`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      onDone(await sendSetup(r.email, `「${f.name}」の管理者に追加しました。`, r.link));
      setEmail("");
      setAdding(false);
    } catch (e) {
      onDone({ tone: "alert", text: e instanceof Error ? e.message : "追加できませんでした" });
    } finally {
      setBusy(null);
    }
  }

  async function resend(admin: FacilitySummary["admins"][number]) {
    setBusy(admin.email);
    try {
      const r = await api<{ link: string }>(`/api/operator/facilities/${f.id}/admins/${admin.uid}/setup-link`, { method: "POST" });
      onDone(await sendSetup(admin.email, "", r.link));
    } catch (e) {
      onDone({ tone: "alert", text: e instanceof Error ? e.message : "リンクを作れませんでした" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-2xl bg-paper p-4">
      <div className="flex flex-wrap items-baseline gap-x-4">
        <span className="min-w-0 flex-1 text-[16px] font-bold">{f.name || "（施設名なし）"}</span>
        <span className="text-[12px] text-mute">
          {fmt(f.createdAt)} 追加・ID：{f.id}
        </span>
      </div>
      <p className="mt-2 mb-1 text-[12px] font-bold text-ink-soft">管理者</p>
      {f.admins.length === 0 ? (
        <p className="text-[14px] text-alert">管理者がいません。下の「管理者を追加」から招待してください。</p>
      ) : (
        <ul className="space-y-1">
          {f.admins.map((a) => (
            <li key={a.uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
              <span className={cx("min-w-0 flex-1 truncate", a.disabled && "text-mute line-through")}>{a.email}</span>
              <span className="text-[12px] text-mute">最後のログイン：{fmt(a.lastSignInAt)}</span>
              {!a.disabled && (
                <Button variant="quiet" className="min-h-8 px-3 text-[12px]" busy={busy === a.email} onClick={() => resend(a)}>
                  パスワード設定メール・リンク
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
          <Input
            type="email"
            required
            aria-label={`${f.name} に追加する管理者のメールアドレス`}
            className="min-w-0 flex-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="管理者のメールアドレス"
          />
          <Button type="submit" busy={busy === "add"} className="min-h-11">
            招待メールを送る
          </Button>
          <Button type="button" variant="quiet" className="min-h-11" onClick={() => setAdding(false)}>
            やめる
          </Button>
        </form>
      ) : (
        <button type="button" className="mt-3 text-[14px] font-bold text-brand-strong hover:underline" onClick={() => setAdding(true)}>
          ＋ 管理者を追加
        </button>
      )}
    </li>
  );
}
