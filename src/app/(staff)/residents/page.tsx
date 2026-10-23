"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { GradeLantern } from "@/components/GradeLantern";
import { Button, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import type { Resident } from "@/lib/domain/records";

function statusOf(r: Resident): string {
  if (r.latestJudgment) return "判定済み";
  if (r.survey?.submittedAt) return "アンケート回答あり・判定前";
  if (r.survey) return "家族の回答待ち";
  if (r.profile && !r.profileConfirmed) return "読み取り結果の確認待ち";
  if (r.profile) return "状態を登録済み";
  if (r.documents.length) return "資料を登録済み";
  return "資料の登録前";
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });

export default function ResidentsPage() {
  const { api } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Resident[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ residents: Resident[] }>("/api/residents")
      .then((r) => setList(r.residents))
      .catch((e) => setError(e.message));
  }, [api]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ resident: Resident }>("/api/residents", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.push(`/residents/${r.resident.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録できませんでした");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-1 text-[24px] font-bold">入居相談中の方</h1>
        <p className="mb-6 text-[14px] text-ink-soft">新しい順に表示しています。</p>
        {error && <Notice tone="alert">{error}</Notice>}
        {list === null && !error && <p className="text-mute">読み込み中…</p>}
        {list?.length === 0 && (
          <p className="rounded-md border border-dashed border-line px-5 py-8 text-center text-ink-soft">
            まだ登録がありません。右の欄からお名前を入れて、最初の方を登録してください。
          </p>
        )}
        <ul className="divide-y divide-line border-y border-line bg-sheet">
          {list?.map((r) => (
            <li key={r.id}>
              <Link
                href={`/residents/${r.id}`}
                className="flex items-center gap-4 px-4 py-3.5 hover:bg-paper"
              >
                {r.latestJudgment ? (
                  <GradeLantern grade={r.latestJudgment.grade} size="sm" />
                ) : (
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-dashed border-line text-[12px] text-mute">
                    未
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{r.name} 様</span>
                  <span className="block text-[13px] text-ink-soft">{statusOf(r)}</span>
                </span>
                <span className="text-[13px] text-mute">{fmt(r.updatedAt)} 更新</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <aside>
        <form onSubmit={create} className="rounded-lg border border-line bg-sheet p-5">
          <h2 className="mb-1 text-[16px] font-bold">入居希望の方を登録</h2>
          <p className="mb-4 text-[13px] text-ink-soft">登録後、資料のアップロードに進みます。</p>
          <label className="mb-1 block text-[13px] font-semibold text-ink-soft" htmlFor="new-name">
            お名前
          </label>
          <Input
            id="new-name"
            required
            maxLength={50}
            placeholder="例：山田 花子"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" busy={busy} className="mt-4 w-full">
            登録する
          </Button>
        </form>
      </aside>
    </div>
  );
}
