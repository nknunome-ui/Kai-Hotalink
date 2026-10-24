"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { GradeLantern } from "@/components/GradeLantern";
import { Button, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import { progressOf } from "@/lib/domain/progress";
import type { Resident } from "@/lib/domain/records";
import { CARE_LEVEL_LABELS } from "@/lib/domain/types";

/** 名前の下に出す、状態の要点（年齢・要介護度・家族の回答） */
function facts(r: Resident): string[] {
  const out: string[] = [];
  if (r.profile?.age != null) out.push(`${r.profile.age}歳`);
  if (r.profile) out.push(CARE_LEVEL_LABELS[r.profile.careLevel]);
  if (r.survey) out.push(r.survey.submittedAt ? "家族回答あり" : "家族回答待ち");
  return out;
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
        <p className="mb-6 text-[14px] text-ink-soft">更新が新しい順に表示しています。名前の下に、次にやることを出しています。</p>
        {error && <Notice tone="alert">{error}</Notice>}
        {list === null && !error && <p className="text-mute">読み込み中…</p>}
        {list?.length === 0 && (
          <p className="rounded-md border border-dashed border-line px-5 py-8 text-center text-ink-soft">
            まだ登録がありません。右の欄からお名前を入れて、最初の方を登録してください。
          </p>
        )}
        {list && list.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-sheet">
            {list.map((r) => {
              const { next, stale } = progressOf(r);
              const f = facts(r);
              return (
                <li key={r.id}>
                  <Link href={`/residents/${r.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-paper">
                    {r.latestJudgment ? (
                      <span className={stale ? "opacity-40" : undefined} title={stale ? "判定のあとで情報が変わっています" : undefined}>
                        <GradeLantern grade={r.latestJudgment.grade} size="sm" />
                      </span>
                    ) : (
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-soft/40 text-center text-[10px] leading-[1.15] text-mute">
                        判定
                        <br />
                        前
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold">
                        {r.name} 様
                        {f.length > 0 && <span className="ml-2 text-[13px] font-normal text-ink-soft">{f.join("・")}</span>}
                      </span>
                      {next ? (
                        <span className={next.waiting ? "block text-[13px] text-ink-soft" : "block text-[13px] font-semibold text-indigo"}>
                          {next.waiting ? next.text : `次：${next.text}`}
                        </span>
                      ) : (
                        <span className="block text-[13px] text-grade-a">判定まで完了</span>
                      )}
                    </span>
                    <span className="hidden shrink-0 text-[13px] text-mute sm:inline">{fmt(r.updatedAt)} 更新</span>
                    <span className="shrink-0 text-mute" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="order-first lg:order-none">
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
