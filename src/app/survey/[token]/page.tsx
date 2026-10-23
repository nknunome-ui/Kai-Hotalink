"use client";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import type { SurveyAnswers, SurveyQuestion } from "@/lib/domain/survey";

interface SurveyData {
  facilityName: string;
  residentName: string;
  submitted: boolean;
  expiresAt: string;
  questions: SurveyQuestion[];
}

export default function SurveyPage() {
  return (
    <Suspense fallback={<Frame><p className="text-[17px] text-mute">読み込み中…</p></Frame>}>
      <Survey />
    </Suspense>
  );
}

function Survey() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SurveyData | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/survey/${token}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "読み込めませんでした");
        setData(body);
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  if (loadError) return <Frame><p className="text-[17px]">{loadError}</p></Frame>;
  if (!data) return <Frame><p className="text-[17px] text-mute">読み込み中…</p></Frame>;
  if (data.submitted || done) {
    return (
      <Frame facility={data.facilityName}>
        <h1 className="mb-3 text-[24px] font-bold">ご回答ありがとうございました</h1>
        <p className="text-[17px] leading-relaxed">
          いただいた内容は、{data.facilityName}の担当者が拝見し、ご入居前のご説明やご相談に使わせていただきます。内容を変更したい場合は、施設にお問い合わせください。
        </p>
      </Frame>
    );
  }

  const required = data.questions.filter((q) => q.required);
  const answered = required.filter((q) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : Boolean(a);
  }).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const missing = required.find((q) => {
      const a = answers[q.id];
      return Array.isArray(a) ? a.length === 0 : !a;
    });
    if (missing) {
      setError("まだ答えていない質問があります");
      document.getElementById(`q-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/survey/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "送信できませんでした");
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame facility={data.facilityName}>
      <h1 className="mb-3 text-[24px] font-bold leading-snug">{data.residentName} 様のご入居にあたってのアンケート</h1>
      <p className="mb-2 text-[16px] leading-relaxed text-ink-soft">
        ご家族のお考えやご希望をうかがい、ご入居前のご説明に役立てるためのものです。正解や間違いはありません。思ったとおりにお答えください。
      </p>
      <p className="mb-8 text-[14px] text-mute">所要時間は5分ほどです。</p>

      <form onSubmit={submit} className="space-y-6">
        {data.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            n={i + 1}
            q={q}
            value={answers[q.id]}
            follow={q.followUp ? (answers[q.followUp.id] as string | undefined) : undefined}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            onFollow={(v) => q.followUp && setAnswers((a) => ({ ...a, [q.followUp!.id]: v }))}
          />
        ))}

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur">
          {error && <p role="alert" className="mb-3 text-[15px] font-semibold text-alert">{error}</p>}
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-soft">
              {answered} / {required.length} 問に回答
            </span>
            <button
              type="submit"
              disabled={busy}
              className="ml-auto min-h-12 rounded-md bg-indigo px-6 text-[17px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "送信中…" : "回答を送信"}
            </button>
          </div>
        </div>
      </form>
    </Frame>
  );
}

function Frame({ facility, children }: { facility?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-sheet px-4 py-3">
        <p className="mx-auto max-w-xl text-[15px] font-semibold">{facility ?? ""}</p>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}

function QuestionCard({
  n,
  q,
  value,
  follow,
  onChange,
  onFollow,
}: {
  n: number;
  q: SurveyQuestion;
  value: string | string[] | undefined;
  follow?: string;
  onChange: (v: string | string[]) => void;
  onFollow: (v: string) => void;
}) {
  const list = Array.isArray(value) ? value : [];
  return (
    <fieldset id={`q-${q.id}`} className="rounded-lg border border-line bg-sheet p-5">
      <legend className="sr-only">質問 {n}</legend>
      <p className="mb-4 text-[17px] font-semibold leading-relaxed">
        <span className="mr-2 font-mincho text-indigo">{n}.</span>
        {q.text}
      </p>
      {q.type === "text" ? (
        <textarea
          rows={4}
          maxLength={2000}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-[16px] focus:border-indigo focus:outline-none"
        />
      ) : (
        <div className="space-y-2">
          {q.options!.map((o) => {
            const checked = q.type === "single" ? value === o.value : list.includes(o.value);
            const limitReached = q.type === "multi" && !!q.maxSelect && list.length >= q.maxSelect && !checked;
            return (
              <label
                key={o.value}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 py-2.5 text-[16px] leading-snug ${
                  checked ? "border-indigo bg-glow-soft" : "border-line"
                } ${limitReached ? "opacity-50" : ""}`}
              >
                <input
                  type={q.type === "single" ? "radio" : "checkbox"}
                  name={q.id}
                  checked={checked}
                  disabled={limitReached}
                  onChange={() => {
                    if (q.type === "single") onChange(o.value);
                    else onChange(checked ? list.filter((v) => v !== o.value) : [...list, o.value]);
                  }}
                  className="size-5 shrink-0 accent-indigo"
                />
                {o.label}
              </label>
            );
          })}
        </div>
      )}
      {q.followUp && value === q.followUp.whenValue && (
        <label className="mt-4 block">
          <span className="mb-1 block text-[15px]">{q.followUp.text}</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={follow ?? ""}
            onChange={(e) => onFollow(e.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-[16px] focus:border-indigo focus:outline-none"
          />
        </label>
      )}
    </fieldset>
  );
}
