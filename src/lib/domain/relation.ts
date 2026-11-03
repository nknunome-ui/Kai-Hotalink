// 判定2: カスハラ発生予測スコア（0〜100）。
// 面談でスタッフが記録したご家族の言動（A 項目）、アンケートの回答と自由記述、
// ご家族の認識と資料のギャップから計算する。入居判定の A〜E とは別枠で出し、
// 点数の内訳（どの記録から何点か）を必ず一緒に示す。
import type { Interview } from "./interview";
import type { SurveyAnswers } from "./survey";
import type { Gap, ResidentProfile } from "./types";

export type RelationSignal = "safe" | "caution" | "danger";

export const SIGNAL_LABELS: Record<RelationSignal, string> = {
  safe: "安全",
  caution: "注意",
  danger: "危険",
};

export interface RelationFactor {
  /** どの記録から来たか（面談・アンケート・ギャップ・組み合わせ・相談員の所感） */
  source: "面談" | "アンケート" | "ギャップ" | "組み合わせ" | "所感";
  text: string;
  /** 加点（マイナスは減点）。係数のときは null */
  points: number | null;
}

export interface RelationRisk {
  score: number;
  signal: RelationSignal;
  factors: RelationFactor[];
  /** ギャップによる係数（1 なら掛けていない） */
  multiplier: number;
  /** 面談の記録がない・アンケートの回答がないなど、材料が足りないこと */
  missing: string[];
  /** 関係づくりのための推奨アクション（判定3 に入れる） */
  actions: string[];
}

// 自由記述から拾う言葉（入居の理由・ご要望・以前のアンケートの「困ったこと」）
const EXHAUSTION_WORDS = ["疲れ果て", "限界", "もう無理", "手に負えない", "任せたい", "丸投げ"];
const DEMAND_WORDS = ["不満", "対応が悪", "もっと良い", "ちゃんと", "責任", "訴え", "クレーム", "許せな", "納得できな"];

const text = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function signalOf(score: number): RelationSignal {
  if (score >= 60) return "danger";
  if (score >= 30) return "caution";
  return "safe";
}

export function relationRisk({
  interview,
  answers,
  profile,
  gaps,
}: {
  interview: Interview | null | undefined;
  answers: SurveyAnswers | null;
  profile: ResidentProfile;
  /** 表示量の設定で絞る前の、すべてのずれ */
  gaps: Gap[];
}): RelationRisk {
  const factors: RelationFactor[] = [];
  const missing: string[] = [];
  const add = (source: RelationFactor["source"], t: string, points: number) => factors.push({ source, text: t, points });

  // ---- A. 面談でのご家族の言動 ----
  const highDemand =
    interview?.demandLevel === "reportEveryInjury" ||
    interview?.demandLevel === "specialTreatment" ||
    answers?.f_reportFrequency === "daily";
  if (!interview) {
    missing.push("家族面談の記録がありません（面談で記録すると、ご家族の言動をスコアに入れます）");
  } else {
    const a = interview.attitudes;
    if (a.includes("highPressure")) add("面談", "面談時の態度が高圧的・タメ口だった", 20);
    if (a.includes("interrupts")) add("面談", "説明を遮る・自分の話ばかりする様子があった", 18);
    if (a.includes("condescending")) add("面談", "スタッフを見下す発言があった", 20);
    if (a.includes("cooperative")) add("面談", "協力的・傾聴姿勢があった", -10);
    if (interview.leaveReason === "complaint") add("面談", "前の施設への不満・トラブルで移ろうとしている", 15);
    if (interview.demandLevel === "reportEveryInjury") add("面談", "小さなケガでも都度報告を求めている", 12);
    if (interview.demandLevel === "specialTreatment") add("面談", "個別対応（特別扱い）を強く希望している", 15);
    if (interview.familyRelation === "othersInterfere") add("面談", "キーパーソン以外の親族が口を出す（言った・言わないになりやすい）", 10);
    if (interview.familyRelation === "keyPersonUninvolved") add("面談", "キーパーソンが非協力的（丸投げ）", 8);

    // 特別な組み合わせ: ご家族の要求が高い ＋ ご本人に暴言・暴力がある
    const aggression = interview.bpsd.includes("aggression") || profile.cognition.aggression;
    if (highDemand && aggression) add("組み合わせ", "ご家族の要求が高く、ご本人に暴言・暴力がある（現場の負担と苦情が重なりやすい）", 20);
    // 急変・事故が多い ＋ 都度の報告を求める
    if (interview.acuteRisk === "high" && (interview.demandLevel === "reportEveryInjury" || answers?.f_reportFrequency === "daily")) {
      add("組み合わせ", "急変・事故のリスクが高く、細かい報告を求めている（報告の回数が増え、漏れが苦情になりやすい）", 12);
    }
  }

  // ---- アンケートの回答 ----
  if (!answers) {
    missing.push("家族アンケートの回答がありません");
  } else {
    if (answers.f_otherFamily === "involved") add("アンケート", "申込者のほかにも、強く関わるご家族がいる", 5);
    if (answers.f_reportFrequency === "daily") add("アンケート", "毎日の様子を細かく知りたいと希望している", 10);
    if (answers.f_priority === "absoluteSafety") add("アンケート", "事故が「絶対に」起きない安全管理を一番に望んでいる（転倒＝施設の過失と考えやすい）", 12);
    if (answers.q3_falls === "noInjury") add("アンケート", "ケガが起きないことを強く望んでいる", 10);

    const free = [text(answers.f_reason), text(answers.f_requests), text(answers.q8_pastExperience)].join("\n");
    const exhausted = EXHAUSTION_WORDS.filter((w) => free.includes(w));
    if (exhausted.length) add("アンケート", `自由記述に介護の負担・限界を表す言葉がある（${exhausted.join("、")}）`, 5);
    const demands = DEMAND_WORDS.filter((w) => free.includes(w));
    if (demands.length) add("アンケート", `自由記述に以前のケアへの不満・要求を表す言葉がある（${demands.join("、")}）`, 8);
  }

  let base = factors.reduce((s, f) => s + (f.points ?? 0), 0);

  // ---- ギャップによる係数: ご家族が状態を軽く見ているほど強く掛ける ----
  const perception = gaps.filter((g) => g.kind === "perception");
  const big = perception.filter((g) => g.level === "大").length;
  const mid = perception.filter((g) => g.level === "中").length;
  const multiplier = Math.min(1.8, 1 + big * 0.2 + mid * 0.1);
  if (multiplier > 1) {
    factors.push({
      source: "ギャップ",
      text: `ご家族の認識と資料の差（大 ${big}件・中 ${mid}件）。「もっとできるはず」という期待とのすれ違いになりやすいため、点数に ×${multiplier.toFixed(1)} を掛けた`,
      points: null,
    });
    base = base * multiplier;
  }

  // ---- 相談員の所感（最終補正）: 3 を中心に ±12 点 ----
  if (interview?.staffConcern) {
    const c = (interview.staffConcern - 3) * 6;
    if (c !== 0) add("所感", `相談員の所感 ${interview.staffConcern}（1＝安全そう、5＝かなり要注意）`, c);
    base += c;
  }

  const score = Math.max(0, Math.min(100, Math.round(base)));
  const risk = { score, signal: signalOf(score), factors, multiplier, missing, actions: [] as string[] };
  risk.actions = relationActions(risk, interview, answers);
  return risk;
}

/** スコアと内訳から、関係づくりのための推奨アクションを出す */
export function relationActions(r: Pick<RelationRisk, "signal" | "multiplier">, interview: Interview | null | undefined, answers: SurveyAnswers | null): string[] {
  const out: string[] = [];
  if (r.signal === "safe") return out;
  out.push("入居前の説明は、施設長または管理者が同席して行い、説明した内容と日時を記録に残す");
  if (interview?.familyRelation === "othersInterfere" || answers?.f_otherFamily === "involved") {
    out.push("施設からの連絡と相談の窓口になるキーパーソンを一人に決めてもらい、書面に残す");
  }
  if (interview?.demandLevel === "reportEveryInjury" || answers?.f_reportFrequency === "daily") {
    out.push("どんなときに・どの方法で連絡するか（連絡のルール）を文書で取り決め、ご家族の署名をもらう");
  }
  if (interview?.demandLevel === "specialTreatment") {
    out.push("施設で対応できること・できないことを一覧にして説明し、個別対応の範囲を入居前に合意する");
  }
  if (answers?.f_priority === "absoluteSafety" || answers?.q3_falls === "noInjury") {
    out.push("転倒などを完全には防げないことを説明し、転倒リスク説明・同意書（念書）を交わしてから入居する");
  }
  if (r.multiplier > 1) {
    out.push("ご本人の今の状態（資料と面談の内容）を、ご家族と一緒に見学・面談で確認してから契約する");
  }
  if (r.signal === "danger") {
    out.push("受け入れるかどうかを、入居判定会議で施設長と複数の職員で検討する");
  }
  return out;
}
