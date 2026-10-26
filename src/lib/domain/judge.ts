// 入居判定エンジン（純粋関数）。
// 方針: AI は資料の読み取りだけを担当し、点数付けと ABCDE はこの決まったルールで行う。
// 同じ入力なら必ず同じ結果になり、判定が低い原因を項目単位で示せる。
// 家族の回答（期待値のずれ）は ABCDE に入れず、別枠で返す。

import {
  CARE_LEVEL_LABELS,
  DEMENTIA_LABELS,
  MEDICAL_ITEM_LABELS,
  MOBILITY_LABELS,
  type Acceptance,
  type Category,
  type FacilitySettings,
  type Gap,
  type GapLevel,
  type GeneratedDocument,
  type Grade,
  type JudgmentResult,
  type Reason,
  type ResidentProfile,
} from "./types";
import { buildSurvey, labelOf, type SurveyAnswers } from "./survey";

type MedicalItem = keyof typeof MEDICAL_ITEM_LABELS;
const MEDICAL_ITEMS = Object.keys(MEDICAL_ITEM_LABELS) as MedicalItem[];

const MEDICAL_POINTS: Record<MedicalItem, number> = {
  gastrostomy: 3,
  tracheostomy: 4,
  dialysis: 3,
  oxygen: 2,
  insulin: 2,
  urinaryCatheter: 1,
  pressureUlcer: 2,
};

const MOBILITY_POINTS = {
  independent: 0,
  supervision: 2,
  partial: 4,
  full: 6,
  bedridden: 7,
} as const;

const cap10 = (n: number) => Math.min(10, n);

// ---------- 足切り ----------

export function knockouts(p: ResidentProfile, acc: Acceptance): Reason[] {
  const out: Reason[] = [];
  const add = (category: Category, text: string, action: string) => out.push({ category, impact: "knockout", text, action });

  const s = p.medical.suction;
  if (s !== "none") {
    if (acc.suction === "none") {
      add(
        "medical",
        "たん吸引が必要だが、施設は対応していない",
        "訪問看護との連携などで、たん吸引に対応できる体制を用意できるか検討する",
      );
    } else if ((s === "night" || s === "both") && acc.suction === "day") {
      add(
        "medical",
        "夜間のたん吸引が必要だが、施設は夜間に対応できない",
        "夜間のたん吸引に対応できる体制（夜間の看護職員の配置、訪問看護との連携）を用意できるか検討する",
      );
    }
  }
  for (const item of MEDICAL_ITEMS) {
    if (p.medical[item] && !acc[item]) {
      add(
        "medical",
        `${MEDICAL_ITEM_LABELS[item]}に対応できない`,
        `${MEDICAL_ITEM_LABELS[item]}に対応できる体制（看護職員・協力医療機関）を用意できるか検討する`,
      );
    }
  }
  if (p.careLevel > acc.maxCareLevel) {
    add(
      "physical",
      `要介護度（${CARE_LEVEL_LABELS[p.careLevel]}）が受け入れ上限（${CARE_LEVEL_LABELS[acc.maxCareLevel]}）を超えている`,
      "必要な介助量を面談で確認し、職員体制で対応できるか、受け入れ上限を見直せるかを検討する",
    );
  }
  if (p.physical.mobility === "bedridden" && !acc.acceptsBedridden) {
    add(
      "physical",
      "寝たきりの方の受け入れに対応していない",
      "体位変換・入浴などの介助体制と設備で対応できるか検討する",
    );
  }
  if (p.cognition.dementiaLevel > acc.maxDementiaLevel) {
    add(
      "cognition",
      "認知症の程度が受け入れ範囲を超えている",
      "面談で症状と必要な対応を詳しく確認し、認知症ケアの体制で対応できるか検討する",
    );
  }
  if (p.cognition.wandering && !acc.acceptsWandering) {
    add("cognition", "徘徊への対応が難しい", "見守りや離設を防ぐ体制で対応できるか検討する");
  }
  if (p.cognition.aggression && !acc.acceptsAggression) {
    add(
      "cognition",
      "暴言・暴力への対応が難しい",
      "主治医と相談して対応方法を確認し、職員の安全も含めて受け入れられるか判断する",
    );
  }
  return out;
}

// ---------- 項目スコア ----------

export function categoryScores(p: ResidentProfile): Record<Category, number> {
  let medical = p.medical.suction === "none" ? 0 : p.medical.suction === "day" ? 2 : 3;
  for (const item of MEDICAL_ITEMS) if (p.medical[item]) medical += MEDICAL_POINTS[item];

  const falls = p.physical.fallsLastYear;
  const physical =
    MOBILITY_POINTS[p.physical.mobility] +
    (falls >= 2 ? 4 : falls === 1 ? 2 : 0) +
    (p.careLevel >= 6 ? 1 : 0);

  const c = p.cognition;
  const cognition =
    c.dementiaLevel * 2 +
    (c.wandering ? 2 : 0) +
    (c.aggression ? 3 : 0) +
    (c.careRefusal ? 1 : 0) +
    (c.nightDisturbance ? 1 : 0);

  return { medical: cap10(medical), physical: cap10(physical), cognition: cap10(cognition) };
}

export function hasFallRisk(p: ResidentProfile): boolean {
  return (
    p.physical.fallsLastYear >= 1 ||
    p.physical.mobility === "supervision" ||
    p.physical.mobility === "partial"
  );
}

function scoreReasons(p: ResidentProfile, scores: Record<Category, number>): Reason[] {
  const out: Reason[] = [];
  const impactOf = (s: number): Reason["impact"] => (s >= 6 ? "high" : "medium");

  if (scores.medical >= 3) {
    const items: string[] = [];
    if (p.medical.suction !== "none") items.push(p.medical.suction === "day" ? "日中のたん吸引" : "夜間のたん吸引");
    for (const item of MEDICAL_ITEMS) if (p.medical[item]) items.push(MEDICAL_ITEM_LABELS[item]);
    out.push({
      category: "medical",
      impact: impactOf(scores.medical),
      text: `医療的ケアの必要度が高い（${items.join("、")}）`,
      action: "必要な処置の内容と回数を確認し、看護職員の配置（とくに夜間）で対応できるかを確かめる",
    });
  }
  if (scores.physical >= 3) {
    const items = [`移動：${MOBILITY_LABELS[p.physical.mobility]}`];
    if (p.physical.fallsLastYear > 0) items.push(`直近1年の転倒 ${p.physical.fallsLastYear}回`);
    if (p.careLevel >= 6) items.push(CARE_LEVEL_LABELS[p.careLevel]);
    out.push({
      category: "physical",
      impact: impactOf(scores.physical),
      text: `身体介助・転倒の負担が大きい（${items.join("、")}）`,
      action: "介助の方法と見守りの体制を決め、転倒のリスクをご家族に説明する",
    });
  }
  if (scores.cognition >= 3) {
    const c = p.cognition;
    const items: string[] = [];
    if (c.dementiaLevel > 0) items.push(`認知症：${DEMENTIA_LABELS[c.dementiaLevel].split("（")[0]}`);
    if (c.wandering) items.push("徘徊");
    if (c.aggression) items.push("暴言・暴力");
    if (c.careRefusal) items.push("介護拒否");
    if (c.nightDisturbance) items.push("夜間の不穏");
    out.push({
      category: "cognition",
      impact: impactOf(scores.cognition),
      text: `認知・行動面の対応が必要（${items.join("、")}）`,
      action: "症状が出やすい時間帯ときっかけを面談で確認し、ケアの方法を職員で共有する",
    });
  }
  return out;
}

export function riskScore(scores: Record<Category, number>, s: FacilitySettings): number {
  const w = s.weights;
  const total = w.medical + w.physical + w.cognition;
  if (total <= 0) return 0;
  const weighted = w.medical * scores.medical + w.physical * scores.physical + w.cognition * scores.cognition;
  return Math.round((weighted / (10 * total)) * 100);
}

export function gradeFromScore(score: number, s: FacilitySettings): Grade {
  const t = s.thresholds;
  if (score < t.a) return "A";
  if (score < t.b) return "B";
  if (score < t.c) return "C";
  return "D";
}

// ---------- 期待値のずれ ----------

/** 本人の状態の重さ。ずれは「重さ × 家族の考えとのギャップ」で大きくなる。 */
export function severityFactor(p: ResidentProfile, scores: Record<Category, number>): number {
  if (scores.medical >= 6 || p.careLevel >= 6 || p.cognition.dementiaLevel >= 3) return 2;
  if (scores.medical >= 3 || p.careLevel >= 5 || p.cognition.dementiaLevel >= 2) return 1.5;
  return 1;
}

function levelOf(m: number): GapLevel {
  if (m >= 4) return "大";
  if (m >= 2) return "中";
  return "小";
}

const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const asText = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function expectationGaps(
  p: ResidentProfile,
  acc: Acceptance,
  answers: SurveyAnswers,
  scores: Record<Category, number>,
): { gaps: Gap[]; wishes: string[] } {
  const sev = severityFactor(p, scores);
  const fall = hasFallRisk(p);
  const gaps: Gap[] = [];
  const wishes: string[] = [];
  const add = (questionId: string, magnitude: number, explain: string) => {
    const m = Math.round(magnitude * 10) / 10;
    gaps.push({ questionId, magnitude: m, level: levelOf(m), explain });
  };

  const q1 = asList(answers.q1_expectation);
  if (q1.includes("medical") && !acc.nightNurse) {
    add(
      "q1_expectation",
      2 * sev,
      "医療的なケアへの期待が高い。夜間は看護師が常駐していないことなど、対応できる範囲を入居前に説明する",
    );
  }
  if (q1.includes("safety") && fall) {
    add("q1_expectation", 1.5 * sev, "安全・見守りへの期待が高い。転倒を完全には防げないことを入居前に説明する");
  }

  if (answers.q2_habits === "keep") {
    const detail = asText(answers.q2_detail).trim();
    add(
      "q2_habits",
      1.5,
      `これまでの習慣を続けたい希望がある${detail ? `（${detail.slice(0, 80)}）` : ""}。施設で対応できない習慣を入居前に説明する`,
    );
  }

  if (answers.q3_falls === "noInjury") {
    add(
      "q3_falls",
      2 * sev * (fall ? 1.5 : 1),
      "ケガを防いでほしいという期待が強い。転倒リスクと見守り体制を説明し、転倒リスク説明・同意書で合意しておく",
    );
  }

  const q4 = asList(answers.q4_contact);
  if (q4.includes("everyChange") && !acc.contactsMinorChanges) {
    add("q4_contact", 1.5, "小さな変化でも連絡がほしい希望がある。どんなときに連絡するか、施設の連絡体制を入居前にすり合わせる");
  }
  if (q4.includes("monthly") && !acc.routineReport) {
    add("q4_contact", 1.5, "定期報告を希望している。施設では定期報告をしていないため、連絡の方法を入居前にすり合わせる");
  }
  if (q4.length > 0) {
    const questions = buildSurvey(p);
    wishes.push(`連絡の希望：${q4.map((v) => labelOf(questions, "q4_contact", v)).join("、")}`);
  }

  switch (answers.q5_endOfLife) {
    case "allTreatment":
      add(
        "q5_endOfLife",
        1.5 * sev,
        "できる医療処置はすべて望んでいる。本人の状態と施設の医療体制を踏まえ、終末期の方針と、対応できないときの流れ（入院・転居）を入居前に話し合う",
      );
      break;
    case "natural":
      if (!acc.endOfLifeCare) {
        add("q5_endOfLife", 2 * sev, "自然な看取りを望んでいるが、施設は看取りに対応していない。最期の過ごし方の方針を入居前に説明する");
      }
      break;
    case "undecided":
      add("q5_endOfLife", 1 * sev, "終末期の方針はまだ決まっていない。施設の看取りの方針を説明し、一緒に考える場を設ける");
      break;
  }

  if (answers.q6_emergency === "contactFirst" && !acc.nightNurse) {
    add(
      "q6_emergency",
      2 * sev,
      "急変時はまず家族に連絡してほしい希望がある。夜間は看護師が不在のため、救急搬送を先に行う場合があることを入居前に確認する",
    );
  } else if (answers.q6_emergency === "discuss") {
    add("q6_emergency", 1 * sev, "急変時の対応を事前に話し合いたい希望がある。入居前に対応手順を一緒に確認する");
  }

  if (answers.q7_differentCare === "familyFirst") {
    add("q7_differentCare", 2, "家族の希望を優先してほしい考えがある。ケアの方針を誰がどう決めるか、意見が違うときの進め方を入居前に確認する");
  } else if (answers.q7_differentCare === "explain") {
    wishes.push("ケアの提案は、理由を十分に説明してから決めてほしい");
  }

  gaps.sort((a, b) => b.magnitude - a.magnitude);
  return { gaps, wishes };
}

export function filterGaps(gaps: Gap[], sensitivity: FacilitySettings["gapSensitivity"]): Gap[] {
  const allowed: GapLevel[] =
    sensitivity === "low" ? ["大"] : sensitivity === "normal" ? ["大", "中"] : ["大", "中", "小"];
  return gaps.filter((g) => allowed.includes(g.level));
}

// ---------- 同意書・特記事項（たたき台） ----------

const DRAFT_NOTE = "※ このひな形はたたき台です。実際の契約に使う前に、弁護士など専門家の確認を受けてください。";

function fallConsent(resident: string, facility: string): GeneratedDocument {
  return {
    kind: "fall-consent",
    title: "転倒リスクに関するご説明と同意書",
    body: [
      `${facility}（以下「施設」）は、${resident}様（以下「ご本人」）のご入居にあたり、転倒のリスクについて次のとおりご説明しました。`,
      "",
      "1. ご本人は、心身の状態から転倒のおそれがあります。",
      "2. 施設は見守りや環境整備など転倒防止に努めますが、加齢に伴う筋力の低下などにより、転倒を完全に防ぐことはできません。",
      "3. 施設は、ご本人の行動を過度に制限せず、ご本人らしい生活を尊重したケアを行います。",
      "4. 転倒が起きた場合は、速やかに必要な対応を行い、ご家族に連絡します。",
      "5. 本書は、上記のリスクと施設の対応方針について説明を受け、理解したことを確認するものです。施設の法的な責任を免除するものではありません。",
      "",
      "上記について説明を受け、理解しました。",
      "",
      "　　年　　月　　日",
      "ご本人　氏名：＿＿＿＿＿＿＿＿　　ご家族（代理人）　氏名：＿＿＿＿＿＿＿＿　続柄：＿＿＿＿",
      "説明者　氏名：＿＿＿＿＿＿＿＿",
      "",
      DRAFT_NOTE,
    ].join("\n"),
  };
}

function emergencyPolicy(resident: string, facility: string, acc: Acceptance): GeneratedDocument {
  return {
    kind: "emergency-policy",
    title: "急変時・終末期の対応方針についての確認書",
    body: [
      `${resident}様の急変時および終末期の対応について、${facility}とご家族で次の内容を確認しました。`,
      "",
      `1. 夜間の体制：${acc.nightNurse ? "夜間も看護師が常駐しています。" : "夜間は看護師が常駐していないため、状況により救急搬送を優先し、その後ご家族に連絡する場合があります。"}`,
      `2. 看取り：${acc.endOfLifeCare ? "施設は看取りに対応しています。具体的な方針は、主治医・ご家族と相談して決めます。" : "施設は看取りに対応していないため、終末期には医療機関などへの移行をご相談する場合があります。"}`,
      "3. 急変時の連絡先と連絡の順番：＿＿＿＿＿＿＿＿＿＿＿＿＿＿",
      "4. 延命処置についてのご希望（現時点）：＿＿＿＿＿＿＿＿＿＿＿＿＿＿",
      "5. 方針は、ご本人の状態の変化に応じて、いつでも見直すことができます。",
      "",
      "　　年　　月　　日　　ご家族　氏名：＿＿＿＿＿＿＿＿　　説明者　氏名：＿＿＿＿＿＿＿＿",
      "",
      DRAFT_NOTE,
    ].join("\n"),
  };
}

const CLAUSES: Record<string, string> = {
  q1_expectation: "施設が提供できる医療的ケア・見守りの範囲は、別紙「受け入れ体制のご説明」のとおりとし、範囲外のケアが必要になった場合は、ご家族と協議のうえ対応を決める。",
  q2_habits: "飲酒・嗜好品・入浴時間などの生活習慣は、集団生活のルールと安全の範囲内で、できる限り配慮する。対応できない習慣については入居前に説明した。",
  q3_falls: "転倒のリスクとその対応方針について、「転倒リスクに関するご説明と同意書」により説明し、ご家族の理解を得た。",
  q4_contact: "施設からご家族への連絡は、ケガ・体調の変化があったときを基本とし、それ以外の連絡の頻度と方法は入居時に取り決める。",
  q5_endOfLife: "終末期の対応方針は、「急変時・終末期の対応方針についての確認書」により確認し、状態の変化に応じて見直す。",
  q6_emergency: "急変時の対応手順と連絡の順番は、「急変時・終末期の対応方針についての確認書」のとおりとする。",
  q7_differentCare: "ケアの方針について施設とご家族の意見が異なる場合は、施設が理由を説明し、ご本人の意思と安全を踏まえて協議のうえ決める。",
};

function specialClauses(
  resident: string,
  facility: string,
  gaps: Gap[],
  fall: boolean,
  medicalScore: number,
  acc: Acceptance,
): GeneratedDocument | null {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const g of gaps) {
    if (g.level === "小" || seen.has(g.questionId)) continue;
    seen.add(g.questionId);
    const c = CLAUSES[g.questionId];
    if (c) lines.push(c);
  }
  if (fall && !seen.has("q3_falls")) lines.push(CLAUSES.q3_falls);
  if (medicalScore >= 3 && !acc.nightNurse) {
    lines.push("夜間は看護師が常駐していないため、夜間の急変時には救急搬送を優先する場合がある。");
  }
  if (lines.length === 0) return null;
  return {
    kind: "special-clauses",
    title: "契約書の特記事項（文案）",
    body: [
      `${resident}様の入居契約にあたり、${facility}とご家族は次の事項を確認した。`,
      "",
      ...lines.map((l, i) => `${i + 1}. ${l}`),
      "",
      DRAFT_NOTE,
    ].join("\n"),
  };
}

// ---------- 総合判定 ----------

export interface JudgeInput {
  residentName: string;
  profile: ResidentProfile;
  settings: FacilitySettings;
  answers: SurveyAnswers | null;
}

export function judge({ residentName, profile, settings, answers }: JudgeInput): JudgmentResult {
  const acc = settings.acceptance;
  const ko = knockouts(profile, acc);
  const scores = categoryScores(profile);
  const score = riskScore(scores, settings);
  const fall = hasFallRisk(profile);

  const reasons: Reason[] = [...ko, ...scoreReasons(profile, scores)];
  let grade: Grade;
  if (ko.length >= 2) grade = "E";
  else if (ko.length === 1) grade = "D";
  else grade = gradeFromScore(score, settings);

  if (fall) {
    reasons.push({
      category: "physical",
      impact: "condition",
      text: "転倒リスクがある（転倒リスク説明・同意書での合意が前提）",
      action: "転倒リスク説明・同意書で、転倒を完全には防げないことをご家族と合意する",
    });
    if (grade === "A") grade = "B";
  }

  const { gaps: allGaps, wishes } = answers
    ? expectationGaps(profile, acc, answers, scores)
    : { gaps: [], wishes: [] };
  const gaps = filterGaps(allGaps, settings.gapSensitivity);

  const documents: GeneratedDocument[] = [];
  if (grade !== "D" && grade !== "E") {
    const facility = settings.facilityName || "施設";
    const resident = residentName || "ご本人";
    if (fall || answers?.q3_falls === "noInjury") documents.push(fallConsent(resident, facility));
    const eolGap = allGaps.some((g) => g.questionId === "q5_endOfLife" || g.questionId === "q6_emergency");
    if (eolGap || answers?.q6_emergency) documents.push(emergencyPolicy(resident, facility, acc));
    const clauses = specialClauses(resident, facility, allGaps, fall, scores.medical, acc);
    if (clauses) documents.push(clauses);
  }

  return {
    grade,
    riskScore: score,
    categoryScores: scores,
    reasons,
    gaps,
    wishes,
    documents,
    surveyAnswered: answers !== null,
  };
}
