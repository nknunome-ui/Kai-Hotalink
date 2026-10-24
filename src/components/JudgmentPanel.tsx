"use client";
import { useState } from "react";
import type { JudgmentRecord } from "@/lib/domain/records";
import { CATEGORY_LABELS, type Category, type GeneratedDocument } from "@/lib/domain/types";
import { GradeLantern } from "./GradeLantern";
import { Button } from "./ui";

const IMPACT_LABEL = {
  knockout: "受け入れ範囲外",
  high: "負担が大きい",
  medium: "負担あり",
  condition: "条件",
} as const;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function JudgmentPanel({ record, fresh }: { record: JudgmentRecord; fresh: boolean }) {
  const r = record.result;
  return (
    <div className="space-y-7">
      <div>
        <GradeLantern grade={r.grade} animate={fresh} />
        <p className="mt-3 text-[12px] text-mute">
          {fmt(record.createdAt)}・{record.createdBy}・設定 v{record.settingsVersion}
        </p>
      </div>

      <section>
        <h3 className="mb-2 text-[15px] font-bold">判定の理由</h3>
        {r.reasons.length === 0 ? (
          <p className="text-[14px] text-ink-soft">受け入れ範囲内で、負担の大きい項目はありません。</p>
        ) : (
          <ul className="space-y-2">
            {r.reasons.map((x, i) => (
              <li key={i} className="flex gap-3 text-[14px]">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    x.impact === "knockout" ? "bg-alert-soft text-alert" : "bg-paper text-ink-soft"
                  }`}
                >
                  {IMPACT_LABEL[x.impact]}
                </span>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        )}
        <Scores scores={r.categoryScores} total={r.riskScore} />
      </section>

      <section>
        <h3 className="mb-1 text-[15px] font-bold">事前に説明すべき点</h3>
        <p className="mb-3 text-[12px] text-mute">家族の回答と施設の方針・ご本人の状態のずれ。判定の ABCDE には含めていません。</p>
        {!r.surveyAnswered ? (
          <p className="text-[14px] text-ink-soft">家族アンケートの回答がまだありません。</p>
        ) : r.gaps.length === 0 ? (
          <p className="text-[14px] text-ink-soft">大きなずれはありません。</p>
        ) : (
          <ul className="space-y-3">
            {r.gaps.map((g, i) => (
              <li key={i} className="border-l-[3px] pl-3 text-[14px]" style={{ borderColor: g.level === "大" ? "var(--color-grade-d)" : g.level === "中" ? "var(--color-grade-c)" : "var(--color-line)" }}>
                <span className="mr-2 text-[12px] font-semibold text-ink-soft">ずれ {g.level}</span>
                {g.explain}
              </li>
            ))}
          </ul>
        )}
        {r.wishes.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-1 text-[13px] font-semibold text-ink-soft">家族の希望（記録）</h4>
            <ul className="list-disc space-y-0.5 pl-5 text-[14px]">
              {r.wishes.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {record.pastExperienceSummary && (
          <div className="mt-4">
            <h4 className="mb-1 text-[13px] font-semibold text-ink-soft">過去に不満を感じた点（AI要約）</h4>
            <p className="text-[14px]">{record.pastExperienceSummary}</p>
          </div>
        )}
      </section>

      {r.documents.length > 0 && (
        <section>
          <h3 className="mb-2 text-[15px] font-bold">同意書・特記事項の文案</h3>
          <div className="space-y-2">
            {r.documents.map((d) => (
              <DocumentDraft key={d.kind} doc={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Scores({ scores, total }: { scores: Record<Category, number>; total: number }) {
  return (
    <div className="mt-4 rounded-xl bg-paper p-3">
      <div className="mb-2 flex justify-between text-[12px] text-ink-soft">
        <span>項目スコア（0〜10）</span>
        <span>リスク点 {total} / 100</span>
      </div>
      {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
        <div key={c} className="mb-1.5 flex items-center gap-2 text-[13px]">
          <span className="w-20 shrink-0 text-ink-soft">{CATEGORY_LABELS[c]}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-brand-strong" style={{ width: `${scores[c] * 10}%` }} />
          </span>
          <span className="w-6 text-right tabular-nums">{scores[c]}</span>
        </div>
      ))}
    </div>
  );
}

function DocumentDraft({ doc }: { doc: GeneratedDocument }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="rounded-2xl border-2 border-line bg-paper">
      <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold">{doc.title}</summary>
      <div className="border-t border-line px-4 py-3">
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{doc.body}</pre>
        <Button
          variant="quiet"
          className="mt-3 min-h-9 text-[13px]"
          onClick={async () => {
            await navigator.clipboard.writeText(doc.body);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "コピーしました" : "文面をコピー"}
        </Button>
      </div>
    </details>
  );
}
