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

/** target: メールが届かないときにリンクを作る相手 */
type Msg = { tone: "info" | "alert"; text: string; target?: { facilityId: string; uid: string; email: string } };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "—";

/** メールを送り、届かないとき用に「リンクを作る」を出す（リンクは押したときだけ作る） */
async function sendSetup(done: string, target: NonNullable<Msg["target"]>): Promise<Msg> {
  try {
    await sendPasswordSetupEmail(target.email);
    return { tone: "info", text: `${done}${target.email} にパスワード設定のメールを送りました。`, target };
  } catch {
    return {
      tone: "alert",
      text: `${done}${target.email} へのメールを送れませんでした。下の「リンクを作る」から、リンクを本人に送ってください。`,
      target,
    };
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
          {msg.target && (
            <SetupLink
              key={msg.target.uid}
              email={msg.target.email}
              create={async () =>
                (
                  await api<{ link: string }>(`/api/operator/facilities/${msg.target!.facilityId}/admins/${msg.target!.uid}/setup-link`, {
                    method: "POST",
                  })
                ).link
              }
              onClose={() => setMsg(null)}
            />
          )}
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
      const r = await api<{ facilityId: string; adminUid: string; adminEmail: string }>("/api/operator/facilities", {
        method: "POST",
        body: JSON.stringify({ name, adminEmail }),
      });
      onDone(await sendSetup(`「${name}」を追加しました。`, { facilityId: r.facilityId, uid: r.adminUid, email: r.adminEmail }));
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
      const r = await api<{ uid: string; email: string }>(`/api/operator/facilities/${f.id}/admins`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      onDone(await sendSetup(`「${f.name}」の管理者に追加しました。`, { facilityId: f.id, uid: r.uid, email: r.email }));
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
    onDone(await sendSetup("", { facilityId: f.id, uid: admin.uid, email: admin.email }));
    setBusy(null);
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
                  パスワード設定メールを再送
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
      <DeleteFacility f={f} onDone={onDone} />
    </li>
  );
}

/** 施設の削除。元に戻せないので、施設名を入力してから消す */
function DeleteFacility({ f, onDone }: { f: FacilitySummary; onDone: (m: Msg) => void }) {
  const { api } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 施設名が空なら施設 ID を入れてもらう（空欄のまま消せないように）
  const expected = f.name.trim() || f.id;
  const matches = name.trim() === expected;

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ residents: number; deletedAccounts: number }>(`/api/operator/facilities/${f.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmName: name }),
      });
      onDone({
        tone: "info",
        text: `「${f.name || f.id}」を削除しました（入居者 ${r.residents}人のデータ、アカウント ${r.deletedAccounts}件）。`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="mt-3 ml-5 text-[13px] text-alert hover:underline" onClick={() => setOpen(true)}>
        施設を削除
      </button>
    );
  }
  return (
    <form onSubmit={remove} className="mt-4 space-y-3 rounded-2xl border-2 border-alert/40 bg-alert-soft p-4">
      <p className="text-[14px] font-bold text-alert">「{f.name || f.id}」を削除します。元に戻せません。</p>
      <p className="text-[13px] leading-relaxed">
        この施設の入居者・資料ファイル・判定・アンケート・受け入れ設定と、この施設のスタッフのアカウント（{f.admins.length}人の管理者を含む）がすべて消えます。
      </p>
      <Field label={f.name.trim() ? `確認のため、施設名「${expected}」を入力してください` : `確認のため、施設 ID「${expected}」を入力してください`}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {error && <Notice tone="alert">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" busy={busy} disabled={!matches} className="border-2 border-alert">
          削除する
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          やめる
        </Button>
      </div>
    </form>
  );
}
