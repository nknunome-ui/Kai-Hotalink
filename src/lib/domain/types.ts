// Hotalink のドメイン型。サーバー・クライアント両方から使う純粋な型定義。
import {
  emptyNeeds,
  MEDICAL_IDS,
  type CareCapacities,
  type MedicalCapabilities,
  type MedicalCareId,
  type MedicalNeeds,
  type NurseStaffing,
} from "./medical";

/** 要介護度: 0=自立, 1-2=要支援1-2, 3-7=要介護1-5 */
export type CareLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  0: "自立",
  1: "要支援1",
  2: "要支援2",
  3: "要介護1",
  4: "要介護2",
  5: "要介護3",
  6: "要介護4",
  7: "要介護5",
};

export type Mobility =
  | "independent"
  | "supervision"
  | "partial"
  | "full"
  | "bedridden";

export const MOBILITY_LABELS: Record<Mobility, string> = {
  independent: "自立",
  supervision: "見守り",
  partial: "一部介助",
  full: "全介助",
  bedridden: "寝たきり",
};

/** 認知症の程度: 0=なし, 1=軽度, 2=中等度, 3=重度, 4=専門医療が必要 */
export type DementiaLevel = 0 | 1 | 2 | 3 | 4;

export const DEMENTIA_LABELS: Record<DementiaLevel, string> = {
  0: "なし",
  1: "軽度（日常生活自立度 I〜IIa 程度）",
  2: "中等度（IIb〜IIIa 程度）",
  3: "重度（IIIb〜IV 程度）",
  4: "専門医療が必要（M 程度）",
};

/** 入居者の状態。AI が資料から抽出し、施設が確認・修正する。 */
export interface ResidentProfile {
  age: number | null;
  careLevel: CareLevel;
  medical: MedicalNeeds;
  physical: {
    mobility: Mobility;
    fallsLastYear: number; // 直近1年の転倒回数
  };
  cognition: {
    dementiaLevel: DementiaLevel;
    wandering: boolean; // 徘徊
    aggression: boolean; // 暴言・暴力
    careRefusal: boolean; // 介護拒否
    nightDisturbance: boolean; // 昼夜逆転・夜間の不穏
  };
  /** 資料から読み取った補足（病名・服薬など、判定には使わず表示用） */
  summary: string;
}

export function emptyProfile(): ResidentProfile {
  return {
    age: null,
    careLevel: 0,
    medical: emptyNeeds(),
    physical: { mobility: "independent", fallsLastYear: 0 },
    cognition: {
      dementiaLevel: 0,
      wandering: false,
      aggression: false,
      careRefusal: false,
      nightDisturbance: false,
    },
    summary: "",
  };
}

/** 施設の受け入れ範囲（足切り条件の元になる） */
export interface Acceptance {
  /** 看護師の配置体制 */
  nurseStaffing: NurseStaffing;
  /** 医療的ケアごとの受け入れ（日中・夜間） */
  medical: MedicalCapabilities;
  /** 人数に上限がある医療的ケア（任意） */
  capacity: CareCapacities;
  maxCareLevel: CareLevel;
  acceptsBedridden: boolean;
  maxDementiaLevel: DementiaLevel;
  acceptsWandering: boolean;
  acceptsAggression: boolean;
  contactsMinorChanges: boolean; // 小さな変化でも家族に連絡する体制
  routineReport: boolean; // 定期報告（月1回程度）を行っている
}

export type PresetId = "standard" | "medical" | "dementia";
export type GapSensitivity = "low" | "normal" | "high";

export interface Weights {
  medical: number;
  physical: number;
  cognition: number;
}

/** リスク点（0〜100）の境目。点数がこの値未満なら該当判定。 */
export interface Thresholds {
  a: number;
  b: number;
  c: number;
}

export interface FacilitySettings {
  facilityName: string;
  acceptance: Acceptance;
  preset: PresetId;
  weights: Weights;
  thresholds: Thresholds;
  gapSensitivity: GapSensitivity;
}

export type Grade = "A" | "B" | "C" | "D" | "E";

export const GRADE_MEANINGS: Record<Grade, { meaning: string; next: string }> = {
  A: { meaning: "問題なく受け入れ可能", next: "通常どおり契約へ" },
  B: { meaning: "条件付きで受け入れ可能", next: "同意書・事前説明をしてから契約" },
  C: { meaning: "要検討", next: "面談で追加確認" },
  D: { meaning: "受け入れ困難", next: "原因の項目を解消できるか検討" },
  E: { meaning: "受け入れ不可", next: "他施設の案内など" },
};

export type ReasonImpact = "knockout" | "high" | "medium" | "condition";
export type Category = "medical" | "physical" | "cognition";

export const CATEGORY_LABELS: Record<Category, string> = {
  medical: "医療",
  physical: "身体・転倒",
  cognition: "認知・行動",
};

export interface Reason {
  category: Category;
  impact: ReasonImpact;
  text: string;
  /** 施設が取れる対応の提案（古い判定記録には無い） */
  action?: string;
}

export type GapLevel = "大" | "中" | "小";

export interface Gap {
  questionId: string;
  level: GapLevel;
  magnitude: number;
  /** 施設に表示する「事前に説明すべき点」 */
  explain: string;
}

export interface GeneratedDocument {
  kind: "fall-consent" | "emergency-policy" | "special-clauses";
  title: string;
  body: string;
}

export interface JudgmentResult {
  grade: Grade;
  riskScore: number; // 0〜100（足切りに当たった場合も参考値として計算）
  categoryScores: Record<Category, number>; // 各 0〜10
  reasons: Reason[];
  gaps: Gap[];
  wishes: string[]; // リスク扱いしない家族の希望
  documents: GeneratedDocument[];
  surveyAnswered: boolean;
}

/** AI が根拠を示す対象の項目（判定に使う項目。医療的ケアは medical.ts の項目 ID） */
export const PROFILE_FIELDS: ProfileField[] = [
  "age",
  "careLevel",
  ...MEDICAL_IDS,
  "mobility",
  "fallsLastYear",
  "dementiaLevel",
  "wandering",
  "aggression",
  "careRefusal",
  "nightDisturbance",
];
export type ProfileField =
  | "age"
  | "careLevel"
  | MedicalCareId
  | "mobility"
  | "fallsLastYear"
  | "dementiaLevel"
  | "wandering"
  | "aggression"
  | "careRefusal"
  | "nightDisturbance";

/** AI が項目の値を決めた根拠（資料からの抜き書き） */
export interface Evidence {
  field: ProfileField;
  quote: string;
  source: string;
}

/** 夜間も看護師がいるか（ご家族への説明・同意書の文案に使う） */
export const hasNightNurse = (acc: Acceptance) => acc.nurseStaffing === "24h";
/** 看取りに対応しているか */
export const offersEndOfLife = (acc: Acceptance) => acc.medical.terminalCare !== "no";
