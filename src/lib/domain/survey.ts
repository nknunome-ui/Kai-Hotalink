// 家族アンケートの設問定義。選択肢の値は内部コード、表示文はやわらかい表現にする。
// 内部の値・変数名も、家族が開示請求で見ても困らない言葉にしている。

import { MEDICAL_CARE } from "./medical";
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
  /** text のとき、1行の短い入力にする（氏名・連絡先など） */
  short?: boolean;
  /** 設問の前に出す区切りの見出し（アンケート画面で使う） */
  section?: string;
}

// ---------- 現在のアンケート（2026年11月〜） ----------
// 面談時入力フォーム仕様の「1〜4」に対応する。ご家族の認識（Q1・Q2）は、資料の内容と比べて
// 入居前に説明すべき点（ギャップ）を見つけるのに使う。

const CURRENT_QUESTIONS: SurveyQuestion[] = [
  {
    id: "f_applicantName",
    section: "お申込みの方について",
    text: "お申込みの方のお名前",
    type: "text",
    short: true,
    required: true,
  },
  {
    id: "f_relation",
    text: "ご本人とのご関係",
    type: "single",
    required: true,
    options: [
      { value: "child", label: "子" },
      { value: "spouse", label: "配偶者" },
      { value: "childSpouse", label: "子の配偶者" },
      { value: "sibling", label: "兄弟姉妹" },
      { value: "grandchild", label: "孫" },
      { value: "other", label: "その他" },
    ],
  },
  {
    id: "f_contact",
    text: "日中に連絡がつきやすい電話番号またはメールアドレス",
    type: "text",
    short: true,
    required: true,
  },
  {
    id: "f_otherFamily",
    text: "ほかに、ご入居のことを一緒に考えているご家族はいらっしゃいますか？",
    type: "single",
    required: true,
    options: [
      { value: "none", label: "いない（私が中心に決める）" },
      { value: "involved", label: "いる（相談しながら決める）" },
      { value: "notInvolved", label: "いるが、あまり関わっていない" },
    ],
  },
  {
    id: "f_careLevel",
    section: "ご本人の今の状態について",
    text: "ご本人の今の要介護度はどれくらいですか？（おおよそで大丈夫です）",
    type: "single",
    required: true,
    options: [
      { value: "1", label: "要支援1" },
      { value: "2", label: "要支援2" },
      { value: "3", label: "要介護1" },
      { value: "4", label: "要介護2" },
      { value: "5", label: "要介護3" },
      { value: "6", label: "要介護4" },
      { value: "7", label: "要介護5" },
      { value: "applying", label: "申請中" },
      { value: "unknown", label: "わからない" },
    ],
  },
  {
    id: "f_mobility",
    text: "移動について、ご家族から見た今の様子に近いものを選んでください",
    type: "single",
    required: true,
    options: [
      { value: "walk", label: "一人で歩ける" },
      { value: "cane", label: "杖や歩行器があれば歩ける" },
      { value: "wheelchairSelf", label: "車椅子（自分で漕げる）" },
      { value: "wheelchairAssist", label: "車椅子（押してもらう必要がある）" },
      { value: "bedridden", label: "ほとんど寝たまま" },
    ],
  },
  {
    id: "f_eating",
    text: "食事について、近いものを選んでください",
    type: "single",
    required: true,
    options: [
      { value: "self", label: "自分で食べられる" },
      { value: "watch", label: "見守りが必要" },
      { value: "assist", label: "介助が必要" },
      { value: "tube", label: "胃ろうなど、口から以外の方法で栄養をとっている" },
    ],
  },
  {
    id: "f_toilet",
    text: "排泄について、近いものを選んでください",
    type: "single",
    required: true,
    options: [
      { value: "toilet", label: "トイレでできる" },
      { value: "pants", label: "リハビリパンツや尿取りパッドを使っている" },
      { value: "diaper", label: "おむつを使っている" },
      { value: "catheter", label: "バルーンなどの管を使っている" },
    ],
  },
  {
    id: "f_cognition",
    text: "もの忘れや会話について、近いものを選んでください",
    type: "single",
    required: true,
    options: [
      { value: "clear", label: "しっかりしている" },
      { value: "forgetful", label: "もの忘れがある" },
      { value: "sometimes", label: "時々つじつまが合わないことがある" },
      { value: "hard", label: "会話や意思の疎通が難しいことが多い" },
    ],
  },
  {
    id: "f_caregiver",
    section: "これまでの介護とお考えについて",
    text: "これまで、主にどなたが介護をされてきましたか？",
    type: "single",
    required: true,
    options: [
      { value: "self", label: "お申込みの方ご自身" },
      { value: "otherFamily", label: "ほかのご家族・親族" },
      { value: "hospital", label: "病院や前の施設" },
      { value: "homeService", label: "ヘルパーなどを利用して自宅で" },
    ],
  },
  {
    id: "f_reason",
    text: "今回、施設への入居を考えられた一番の理由を教えてください",
    type: "text",
    required: false,
  },
  {
    id: "f_endOfLife",
    text: "ご本人の最期のとき（看取り）について、今のお考えに近いものを選んでください",
    type: "single",
    required: true,
    options: [
      { value: "natural", label: "できる限り施設で、自然に見送りたい" },
      { value: "prolong", label: "病院での延命治療（胃ろうや人工呼吸器など）を希望する" },
      { value: "undecided", label: "まだ考えていない・わからない" },
    ],
  },
  {
    id: "f_reportFrequency",
    section: "施設へのご要望について",
    text: "施設からの「日々のご様子」のご報告は、どのくらいの頻度を希望されますか？",
    type: "single",
    required: true,
    options: [
      { value: "onChange", label: "何か変化があったときだけでよい（お任せする）" },
      { value: "monthly", label: "月に1回程度" },
      { value: "weekly", label: "毎週教えてほしい" },
      { value: "daily", label: "毎日の様子を細かく知りたい" },
    ],
  },
  {
    id: "f_priority",
    text: "施設での生活で、一番大切にしてほしいことは何ですか？",
    type: "single",
    required: true,
    options: [
      { value: "freedom", label: "本人の自由な生活・意思の尊重" },
      { value: "absoluteSafety", label: "転倒などの事故が「絶対に」起きないような安全管理" },
      { value: "medical", label: "医療体制の充実" },
    ],
  },
  {
    id: "f_requests",
    text: "そのほか、施設に特に配慮してほしいことや、ご要望があればご記入ください",
    type: "text",
    required: false,
  },
];

// ---------- 以前のアンケート（2026年10月まで） ----------
// すでに送った URL・回答済みのアンケートを表示・判定するために残している。

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
  // 呼吸・気道系か栄養・水分補給系のケアが必要な方は、急変時の対応を確認しておく
  return MEDICAL_CARE.some(
    (m) => (m.group === "respiratory" || m.group === "nutrition") && profile.medical[m.id] !== "none",
  );
}

/** これから発行するアンケートの設問。医療的ケアがあれば急変時の設問を足す */
export function buildSurvey(profile: ResidentProfile | null): SurveyQuestion[] {
  const questions = [...CURRENT_QUESTIONS];
  if (needsEmergencyQuestion(profile)) {
    // 看取りの設問のあとに入れる
    const at = questions.findIndex((q) => q.id === "f_endOfLife") + 1;
    questions.splice(at, 0, EMERGENCY_QUESTION);
  }
  return questions;
}

const ALL_QUESTIONS = [...CURRENT_QUESTIONS, ...BASE_QUESTIONS, EMERGENCY_QUESTION, ...TAIL_QUESTIONS];

/** 発行時に記録した設問IDから設問を復元する（以前のアンケートも、記録した順番どおりに） */
export function surveyByIds(ids: string[]): SurveyQuestion[] {
  return ids.map((id) => ALL_QUESTIONS.find((q) => q.id === id)).filter((q): q is SurveyQuestion => Boolean(q));
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
      if (a !== undefined && (typeof a !== "string" || a.length > (q.short ? 200 : 2000))) {
        return `「${q.text}」の回答が長すぎます`;
      }
      if (q.required && (typeof a !== "string" || !a.trim())) return `未回答の設問があります：${q.text}`;
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
