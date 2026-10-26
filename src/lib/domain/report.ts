// 判定結果を、施設の担当者が読むレポートの形（結論・問題点・やること）に組み立てる。
// 判定そのものは judge.ts で決まっており、ここでは並べ方と言葉だけを決める。
import { GRADE_MEANINGS, type Category, type JudgmentResult, type Reason, type ReasonImpact } from "./types";

export const IMPACT_LABEL: Record<ReasonImpact, string> = {
  knockout: "受け入れ範囲外",
  high: "負担が大きい",
  medium: "負担あり",
  condition: "条件",
};

/** 古い判定記録（提案を持たない）向けの、分野ごとの提案 */
const FALLBACK_ACTION: Record<Category, string> = {
  medical: "必要な医療的ケアの内容を確認し、施設の看護体制で対応できるかを検討する",
  physical: "必要な介助と見守りの体制を確認する",
  cognition: "認知症の症状と対応方法を面談で詳しく確認する",
};

export interface ReportAction {
  /** どの種類のやることか（画面での見出し・色分けに使う） */
  kind: "resolve" | "prepare" | "explain" | "document" | "next";
  text: string;
  /** 受け入れの前に必ず片づけること */
  required: boolean;
}

export interface Report {
  /** 1〜2行の結論（判定の意味「受け入れ困難」などは別に表示するので含めない） */
  headline: string;
  problems: Reason[];
  actions: ReportAction[];
}

const IMPACT_ORDER: ReasonImpact[] = ["knockout", "high", "medium", "condition"];

export function buildReport(r: JudgmentResult): Report {
  const problems = [...r.reasons].sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact));
  const knockouts = problems.filter((p) => p.impact === "knockout");
  const heavy = problems.filter((p) => p.impact === "high" || p.impact === "medium");
  const conditions = problems.filter((p) => p.impact === "condition");

  let headline: string;
  if (knockouts.length > 0) {
    headline = `施設の受け入れ範囲を超えている項目が${knockouts.length}つあります（${knockouts
      .map((k) => shortText(k.text))
      .join("、")}）。`;
  } else if (r.grade === "C" || r.grade === "D") {
    const areas = heavy.map((h) => h.category).filter(unique).map(categoryWord).join("・") || "心身の状態";
    headline = `受け入れ範囲内ですが、${areas}の負担が大きいため、面談での確認が必要です。`;
  } else if (r.grade === "B") {
    const what = conditions.length > 0 ? "転倒リスクの説明と同意" : "いくつかの事前説明";
    headline = `${what}を済ませれば受け入れられます。`;
  } else {
    headline = "大きな問題は見つかりませんでした。";
  }
  if (r.surveyAnswered && r.gaps.some((g) => g.level === "大")) {
    headline += " ご家族の考えと大きなずれがあるため、入居前の説明が特に大切です。";
  }

  const actions: ReportAction[] = [];
  for (const k of knockouts) actions.push({ kind: "resolve", text: k.action ?? FALLBACK_ACTION[k.category], required: true });
  for (const h of heavy) actions.push({ kind: "prepare", text: h.action ?? FALLBACK_ACTION[h.category], required: false });
  for (const c of conditions) {
    actions.push({ kind: "prepare", text: c.action ?? "転倒リスクについてご家族と合意する", required: true });
  }
  for (const g of r.gaps) actions.push({ kind: "explain", text: g.explain, required: g.level === "大" });
  if (!r.surveyAnswered) {
    actions.push({ kind: "explain", text: "家族アンケートの回答をもらい、ご家族の考えとのずれを確認する", required: false });
  }
  for (const d of r.documents) actions.push({ kind: "document", text: `「${d.title}」を用意し、説明して署名をもらう`, required: true });
  actions.push({ kind: "next", text: GRADE_MEANINGS[r.grade].next, required: false });

  return { headline, problems, actions };
}

const unique = <T,>(v: T, i: number, a: T[]) => a.indexOf(v) === i;

function categoryWord(c: Category): string {
  return c === "medical" ? "医療的ケア" : c === "physical" ? "身体介助" : "認知症への対応";
}

/** 「〜が必要だが、施設は〜」のような理由を、結論に入れる短い言葉にする */
function shortText(text: string): string {
  return text
    .split("が必要だが")[0]
    .split("（")[0]
    .replace(/に対応できない$|への対応が難しい$|の受け入れに対応していない$|が受け入れ範囲を超えている$/, "");
}
