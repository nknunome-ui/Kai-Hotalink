"use client";
import { useEffect, useRef, useState } from "react";
import type { JudgmentRecord } from "@/lib/domain/records";
import { buildReport, IMPACT_LABEL, type ReportAction } from "@/lib/domain/report";
import { CATEGORY_LABELS, GRADE_MEANINGS, type Category, type GeneratedDocument, type Reason } from "@/lib/domain/types";
import { GradeLantern, gradeColor } from "./GradeLantern";
import { Button, cx } from "./ui";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

/** 右の欄に出す判定の要約。詳しくは下のレポートで読む。 */
export function JudgmentSummary({ record, fresh }: { record: JudgmentRecord; fresh: boolean }) {
  const r = record.result;
  const report = buildReport(r);
  const required = report.actions.filter((a) => a.required && a.kind !== "next").length;
  return (
    <div className="space-y-4">
      <GradeLantern grade={r.grade} animate={fresh} />
      <p className="text-[15px] leading-relaxed">{report.headline}</p>
      <ul className="flex flex-wrap gap-2 text-[13px]">
        <li className="rounded-full bg-paper px-3 py-1">
          問題点 <b>{report.problems.length}</b>件
        </li>
        <li className="rounded-full bg-paper px-3 py-1">
          受け入れ前に必要 <b>{required}</b>件
        </li>
      </ul>
      <a
        href="#judgment-report"
        className="flex min-h-11 items-center justify-center rounded-full border-2 border-brand-soft px-4 font-bold text-brand-strong hover:border-brand hover:bg-brand-tint"
      >
        判定レポートを見る ↓
      </a>
      <p className="text-[12px] text-mute">
        {fmt(record.createdAt)}・{record.createdBy}・設定 v{record.settingsVersion}
      </p>
    </div>
  );
}

/** 判定レポート。結論 → 問題点 → やること → ご家族とのずれ → 書類 の順に読む。印刷にも使う。 */
export function JudgmentReport({ record, residentName }: { record: JudgmentRecord; residentName: string }) {
  const r = record.result;
  const report = buildReport(r);
  const color = gradeColor(r.grade);
  const ref = useRef<HTMLElement>(null);

  // 書類の文案は折りたたんでいるので、印刷するときだけ開いて中身も印刷する
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = Array.from(ref.current?.querySelectorAll<HTMLDetailsElement>("details[data-print-open]:not([open])") ?? []);
      opened.forEach((d) => (d.open = true));
    };
    const after = () => opened.forEach((d) => (d.open = false));
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return (
    <article
      ref={ref}
      id="judgment-report"
      className="mt-3 scroll-mt-6 overflow-hidden rounded-3xl bg-sheet shadow-card print:mt-0 print:rounded-none print:shadow-none"
    >
      {/* 表紙 */}
      <header className="border-b-4 px-5 py-5 sm:px-7" style={{ borderColor: color }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-brand-strong">入居判定レポート</p>
            <h2 className="text-[22px] font-bold">{residentName} 様</h2>
            <p className="text-[12px] text-mute">
              {fmtDate(record.createdAt)} 作成・{record.createdBy}・受け入れ設定 v{record.settingsVersion}
            </p>
          </div>
          <Button variant="quiet" className="min-h-9 px-4 text-[13px] print:hidden" onClick={() => window.print()}>
            印刷・PDFで保存
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-paper p-4">
          <span
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-full text-[30px] font-bold text-white"
            style={{ background: color }}
            aria-label={`判定 ${r.grade}`}
          >
            {r.grade}
          </span>
          <div>
            <p className="text-[17px] font-bold">{GRADE_MEANINGS[r.grade].meaning}</p>
            <p className="text-[15px] leading-relaxed">{report.headline}</p>
          </div>
        </div>
      </header>

      <div className="space-y-8 px-5 py-6 sm:px-7">
        <Section n={1} title="問題点" note="判定を下げている理由です。上ほど重要です。">
          {report.problems.length === 0 ? (
            <p className="text-[14px] text-ink-soft">受け入れ範囲内で、負担の大きい項目はありません。</p>
          ) : (
            <ul className="space-y-2">
              {report.problems.map((p, i) => (
                <Problem key={i} reason={p} />
              ))}
            </ul>
          )}
        </Section>

        <Section n={2} title="やること（提案）" note="受け入れの判断と準備のために、施設で行うことの提案です。">
          <ActionList actions={report.actions} />
        </Section>

        <Section n={3} title="ご家族の考えとのずれ" note="ご家族の回答と、施設の方針・ご本人の状態の違いです。判定の A〜E には含めていません。">
          {!r.surveyAnswered ? (
            <p className="text-[14px] text-ink-soft">家族アンケートの回答がまだありません。</p>
          ) : r.gaps.length === 0 ? (
            <p className="text-[14px] text-ink-soft">大きなずれはありません。</p>
          ) : (
            <ul className="space-y-2">
              {r.gaps.map((g, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-paper p-3 text-[14px] leading-relaxed">
                  <span
                    className={cx(
                      "h-fit shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold",
                      g.level === "大" ? "bg-alert-soft text-alert" : g.level === "中" ? "bg-brand-tint text-brand-strong" : "bg-sheet text-ink-soft",
                    )}
                  >
                    ずれ {g.level}
                  </span>
                  <span>{g.explain}</span>
                </li>
              ))}
            </ul>
          )}
          {r.wishes.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1 text-[13px] font-bold text-ink-soft">ご家族の希望（記録）</h4>
              <ul className="list-disc space-y-0.5 pl-5 text-[14px]">
                {r.wishes.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {record.pastExperienceSummary && (
            <div className="mt-4">
              <h4 className="mb-1 text-[13px] font-bold text-ink-soft">過去に不満を感じた点（AI要約）</h4>
              <p className="text-[14px]">{record.pastExperienceSummary}</p>
            </div>
          )}
        </Section>

        {r.documents.length > 0 && (
          <Section n={4} title="用意する書類（文案）" note="たたき台です。施設の書式に合わせて直してから使ってください。">
            <div className="space-y-2">
              {r.documents.map((d) => (
                <DocumentDraft key={d.kind} doc={d} />
              ))}
            </div>
          </Section>
        )}

        <details className="rounded-2xl bg-paper print:hidden">
          <summary className="cursor-pointer px-4 py-3 text-[14px] font-bold text-ink-soft">参考：点数の内訳</summary>
          <div className="px-4 pb-4">
            <Scores scores={r.categoryScores} total={r.riskScore} />
          </div>
        </details>

        <p className="border-t border-line pt-4 text-[12px] text-mute">
          この判定は判断材料です。入居の可否は施設の担当者が決めてください。
        </p>
      </div>
    </article>
  );
}

function Section({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h3 className="flex items-center gap-2 text-[17px] font-bold">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-strong text-[14px] text-white">{n}</span>
        {title}
      </h3>
      {note && <p className="mt-1 mb-3 text-[13px] text-ink-soft">{note}</p>}
      {children}
    </section>
  );
}

function Problem({ reason }: { reason: Reason }) {
  const ko = reason.impact === "knockout";
  return (
    <li className={cx("flex gap-3 rounded-2xl p-3 text-[14px] leading-relaxed", ko ? "bg-alert-soft" : "bg-paper")}>
      <span
        className={cx(
          "h-fit shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold",
          ko ? "bg-alert text-white" : reason.impact === "condition" ? "bg-sheet text-ink-soft" : "bg-brand-tint text-brand-strong",
        )}
      >
        {IMPACT_LABEL[reason.impact]}
      </span>
      <span>
        <span className="mr-2 text-[12px] text-ink-soft">{CATEGORY_LABELS[reason.category]}</span>
        <span className={ko ? "font-bold text-alert" : undefined}>{reason.text}</span>
      </span>
    </li>
  );
}

const ACTION_LABEL: Record<ReportAction["kind"], string> = {
  resolve: "解消",
  prepare: "準備",
  explain: "説明",
  document: "書類",
  next: "次の対応",
};

function ActionList({ actions }: { actions: ReportAction[] }) {
  return (
    <ol className="space-y-2">
      {actions.map((a, i) => (
        <li
          key={i}
          className={cx(
            "flex gap-3 rounded-2xl border-2 p-3 text-[14px] leading-relaxed",
            a.kind === "next" ? "border-brand bg-brand-tint" : "border-line",
          )}
        >
          <span className="mt-0.5 inline-block size-4 shrink-0 rounded border-2 border-ink-soft/50 print:border-ink" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="mr-2 text-[12px] font-bold text-brand-strong">{ACTION_LABEL[a.kind]}</span>
            {a.text}
          </span>
          {a.required && (
            <span className="h-fit shrink-0 rounded-full bg-alert-soft px-2 py-0.5 text-[11px] font-bold text-alert">受け入れ前に必要</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Scores({ scores, total }: { scores: Record<Category, number>; total: number }) {
  return (
    <div className="rounded-xl bg-sheet p-3">
      <div className="mb-2 flex justify-between text-[12px] text-ink-soft">
        <span>項目スコア（0〜10、大きいほど施設の負担が大きい）</span>
        <span>リスク点 {total} / 100</span>
      </div>
      {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
        <div key={c} className="mb-1.5 flex items-center gap-2 text-[13px]">
          <span className="w-20 shrink-0 text-ink-soft">{CATEGORY_LABELS[c]}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${scores[c] * 10}%` }} />
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
    <details data-print-open className="rounded-2xl border-2 border-line bg-paper print:border-0">
      <summary className="cursor-pointer px-4 py-3 text-[14px] font-bold">{doc.title}</summary>
      <div className="border-t border-line px-4 py-3">
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{doc.body}</pre>
        <Button
          variant="quiet"
          className="mt-3 min-h-9 text-[13px] print:hidden"
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
