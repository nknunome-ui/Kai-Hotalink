// 家族アンケートの設問定義。選択肢の値は内部コード、表示文はやわらかい表現にする。
// 内部の値・変数名も、家族が開示請求で見ても困らない言葉にしている。

import type { ResidentProfile } from "./types";

export interface SurveyOption {
  value: string;
  label: string;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  type: "single" | "multi" | "text";
  options?: SurveyOption[];
  maxSelect?: number;
  /** この設問の答えが特定の値のとき、追加で自由記述を聞く */
  followUp?: { whenValue: string; id: string; text: string };
  /** 資料の内容に応じて追加された設問か */
  dynamic?: boolean;
  required?: boolean;
}

const BASE_QUESTIONS: SurveyQuestion[] = [
  {
    id: "q1_expectation",
    text: "施設に一番期待することは何ですか？（2つまで選べます）",
    type: "multi",
    maxSelect: 2,
    required: true,
    options: [
      { value: "safety", label: "安全・見守り" },
      { value: "medical", label: "医療的なケア" },
      { value: "enjoyment", label: "楽しく過ごせること" },
      { value: "familyRelief", label: "ご家族の負担が減ること" },
      { value: "wishes", label: "ご本人の希望をかなえること" },
    ],
  },
  {
    id: "q2_habits",
    text: "これまでの生活習慣（お酒、嗜好品、入浴の時間など）は、どの程度続けたいですか？",
    type: "single",
    required: true,
    options: [
      { value: "keep", label: "これまで通りできるだけ続けたい" },
      { value: "withinRules", label: "施設のルールの範囲で配慮してほしい" },
      { value: "followFacility", label: "安全を優先し、施設のやり方に合わせたい" },
    ],
    followUp: {
      whenValue: "keep",
      id: "q2_detail",
      text: "続けたい習慣を具体的に教えてください",
    },
  },
  {
    id: "q3_falls",
    text: "施設でも見守りに努めますが、加齢による筋力低下などで、転倒を完全に防ぐことは難しいのが現状です。この点について、どのようにお考えですか？",
    type: "single",
    required: true,
    options: [
      { value: "noInjury", label: "ケガは起きないようにしてほしい" },
      { value: "notify", label: "起きることはあると思うが、変化があれば連絡がほしい" },
      { value: "accept", label: "ある程度は仕方がないと理解している" },
    ],
  },
  {
    id: "q4_contact",
    text: "施設からのご連絡は、どんなときにあると安心ですか？（いくつでも選べます）",
    type: "multi",
    required: true,
    options: [
      { value: "incident", label: "ケガや体調の変化があったとき" },
      { value: "everyChange", label: "小さな変化でもその都度" },
      { value: "monthly", label: "月1回程度の定期報告" },
      { value: "other", label: "その他" },
    ],
  },
  {
    id: "q5_endOfLife",
    text: "今後、年齢やご病気の進行でお食事が進まなくなってきた場合、どのような対応を望まれますか？",
    type: "single",
    required: true,
    options: [
      { value: "allTreatment", label: "できる医療処置（胃ろうや点滴など）はしてほしい" },
      { value: "consult", label: "医師と相談しながら、その時に決めたい" },
      { value: "natural", label: "無理な延命はせず、自然に過ごすことを優先したい" },
      { value: "undecided", label: "まだ考えられていない" },
    ],
  },
];

const EMERGENCY_QUESTION: SurveyQuestion = {
  id: "q6_emergency",
  text: "急に容体が変わったとき、どのように対応してほしいですか？",
  type: "single",
  required: true,
  dynamic: true,
  options: [
    { value: "transport", label: "すぐに救急搬送してほしい" },
    { value: "contactFirst", label: "まず家族に連絡し、相談して決めたい" },
    { value: "doctor", label: "主治医の判断に任せたい" },
    { value: "discuss", label: "事前に話し合っておきたい" },
  ],
};

const TAIL_QUESTIONS: SurveyQuestion[] = [
  {
    id: "q7_differentCare",
    text: "施設の医師やスタッフから、ご家族のお考えと異なるケアの提案があった場合、どのように進めるのが安心ですか？",
    type: "single",
    required: true,
    options: [
      { value: "familyFirst", label: "ご家族の希望をできるだけ優先してほしい" },
      { value: "explain", label: "理由を十分に説明してもらってから決めたい" },
      { value: "collaborate", label: "専門職の意見を聞きながら、すり合わせて決めたい" },
    ],
  },
  {
    id: "q8_pastExperience",
    text: "これまで利用した病院や介護サービスで、困ったことや「もっとこうしてほしかった」と感じたことがあれば教えてください（任意）",
    type: "text",
    required: false,
  },
];

/** 医療的ケアがあると急変時の設問を追加する（設問の動的生成） */
export function needsEmergencyQuestion(profile: ResidentProfile | null): boolean {
  if (!profile) return false;
  const m = profile.medical;
  return m.suction !== "none" || m.gastrostomy || m.tracheostomy || m.oxygen;
}

export function buildSurvey(profile: ResidentProfile | null): SurveyQuestion[] {
  const questions = [...BASE_QUESTIONS];
  if (needsEmergencyQuestion(profile)) questions.push(EMERGENCY_QUESTION);
  questions.push(...TAIL_QUESTIONS);
  return questions;
}

/** 発行時に記録した設問IDから設問を復元する */
export function surveyByIds(ids: string[]): SurveyQuestion[] {
  return [...BASE_QUESTIONS, EMERGENCY_QUESTION, ...TAIL_QUESTIONS].filter((q) => ids.includes(q.id));
}

export type SurveyAnswers = Record<string, string | string[]>;

/** 回答の形式チェック。問題があればメッセージを返す。 */
export function validateAnswers(
  questions: SurveyQuestion[],
  answers: SurveyAnswers,
): string | null {
  for (const q of questions) {
    const a = answers[q.id];
    if (q.type === "text") {
      if (a !== undefined && (typeof a !== "string" || a.length > 2000)) {
        return `「${q.text}」の回答が長すぎます`;
      }
      continue;
    }
    const values = q.options!.map((o) => o.value);
    if (q.type === "single") {
      if (a === undefined || a === "") {
        if (q.required) return `未回答の設問があります：${q.text}`;
        continue;
      }
      if (typeof a !== "string" || !values.includes(a)) return "回答の形式が正しくありません";
    } else {
      const list = Array.isArray(a) ? a : [];
      if (q.required && list.length === 0) return `未回答の設問があります：${q.text}`;
      if (list.some((v) => !values.includes(v))) return "回答の形式が正しくありません";
      if (q.maxSelect && list.length > q.maxSelect) {
        return `「${q.text}」は${q.maxSelect}つまで選べます`;
      }
    }
    if (q.followUp) {
      const f = answers[q.followUp.id];
      if (f !== undefined && (typeof f !== "string" || f.length > 1000)) {
        return "自由記述が長すぎます";
      }
    }
  }
  return null;
}

/** 回答を検証済みの形に絞り込む（未知のキーを捨てる） */
export function pickAnswers(questions: SurveyQuestion[], answers: SurveyAnswers): SurveyAnswers {
  const out: SurveyAnswers = {};
  for (const q of questions) {
    if (answers[q.id] !== undefined) out[q.id] = answers[q.id];
    if (q.followUp && answers[q.followUp.id] !== undefined) {
      out[q.followUp.id] = answers[q.followUp.id];
    }
  }
  return out;
}

export function labelOf(questions: SurveyQuestion[], id: string, value: string): string {
  const q = questions.find((x) => x.id === id);
  return q?.options?.find((o) => o.value === value)?.label ?? value;
}
