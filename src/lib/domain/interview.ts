// 家族面談・見学・相談のときに、スタッフが入力する記録（面談時入力フォームの A・B 項目）。
// A はご家族の言動・態度、B はご本人の状態。点数付けは判定の段階で行う。
import { neededItems } from "./medical";
import type { ResidentProfile } from "./types";

/** A-1. 面談時の態度・言葉遣い（複数選択） */
export const ATTITUDES = [
  { value: "highPressure", label: "高圧的・タメ口" },
  { value: "interrupts", label: "説明を遮る・自分の話ばかりする" },
  { value: "condescending", label: "スタッフを見下す発言があった" },
  { value: "cooperative", label: "協力的・傾聴姿勢あり" },
] as const;
export type Attitude = (typeof ATTITUDES)[number]["value"];

/** A-2. 前施設からの退所理由（単一選択） */
export const LEAVE_REASONS = [
  { value: "medicalNeeds", label: "医療依存度の増加（対応不可）" },
  { value: "homeLimit", label: "自宅介護の限界" },
  { value: "complaint", label: "前施設への不満・トラブル" },
  { value: "other", label: "金銭的理由・その他" },
] as const;
export type LeaveReason = (typeof LEAVE_REASONS)[number]["value"];

/** A-3. 施設への期待・要求水準（単一選択） */
export const DEMAND_LEVELS = [
  { value: "followsPolicy", label: "施設の方針に従う（協力的）" },
  { value: "reportEveryInjury", label: "小さなケガでも都度報告を求める" },
  { value: "specialTreatment", label: "個別対応（特別扱い）を強く希望" },
] as const;
export type DemandLevel = (typeof DEMAND_LEVELS)[number]["value"];

/** A-4. 親族間の関係性（単一選択） */
export const FAMILY_RELATIONS = [
  { value: "keyPersonDecides", label: "キーパーソンに決定権がある" },
  { value: "othersInterfere", label: "他の親族（兄弟など）が口を出す" },
  { value: "keyPersonUninvolved", label: "キーパーソンが非協力的（丸投げ）" },
] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number]["value"];

/** B-2. BPSD（周辺症状）（複数選択。「とくになし」は空の配列） */
export const BPSD_ITEMS = [
  { value: "aggression", label: "暴言・暴力" },
  { value: "wandering", label: "徘徊" },
  { value: "careRefusal", label: "介護拒否" },
  { value: "uncleanBehavior", label: "不潔行為" },
] as const;
export type Bpsd = (typeof BPSD_ITEMS)[number]["value"];

/** B-3. 急変・事故リスク（単一選択） */
export const ACUTE_RISKS = [
  { value: "high", label: "高（頻繁な転倒・誤嚥・発熱あり）" },
  { value: "medium", label: "中（時々あり）" },
  { value: "low", label: "低（安定している）" },
] as const;
export type AcuteRisk = (typeof ACUTE_RISKS)[number]["value"];

export interface Interview {
  attitudes: Attitude[];
  leaveReason: LeaveReason | null;
  demandLevel: DemandLevel | null;
  familyRelation: FamilyRelation | null;
  /** A-5. 相談員の所感 1（安全そう）〜 5（かなり要注意） */
  staffConcern: 1 | 2 | 3 | 4 | 5 | null;
  bpsd: Bpsd[];
  acuteRisk: AcuteRisk | null;
  recordedAt: string;
  recordedBy: string;
}

export function emptyInterview(): Omit<Interview, "recordedAt" | "recordedBy"> {
  return {
    attitudes: [],
    leaveReason: null,
    demandLevel: null,
    familyRelation: null,
    staffConcern: null,
    bpsd: [],
    acuteRisk: null,
  };
}

const pick = <T extends string>(options: readonly { value: T }[], v: unknown): T | null =>
  options.some((o) => o.value === v) ? (v as T) : null;
const pickMany = <T extends string>(options: readonly { value: T }[], v: unknown): T[] =>
  Array.isArray(v) ? options.filter((o) => v.includes(o.value)).map((o) => o.value) : [];

/** 画面から来た面談の記録を、知っている選択肢だけに整える */
export function normalizeInterview(input: unknown): Omit<Interview, "recordedAt" | "recordedBy"> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const concern = Number(i.staffConcern);
  return {
    attitudes: pickMany(ATTITUDES, i.attitudes),
    leaveReason: pick(LEAVE_REASONS, i.leaveReason),
    demandLevel: pick(DEMAND_LEVELS, i.demandLevel),
    familyRelation: pick(FAMILY_RELATIONS, i.familyRelation),
    staffConcern: Number.isInteger(concern) && concern >= 1 && concern <= 5 ? (concern as Interview["staffConcern"]) : null,
    bpsd: pickMany(BPSD_ITEMS, i.bpsd),
    acuteRisk: pick(ACUTE_RISKS, i.acuteRisk),
  };
}

export const labelOfOption = (options: readonly { value: string; label: string }[], v: string | null) =>
  options.find((o) => o.value === v)?.label ?? "未入力";

/**
 * 面談でご家族に確認すべき事項（資料・AI の読み取りから自動で作る）。
 * 資料の情報が今も正しいか、資料に書かれていないことは何かを確かめる。
 */
export function interviewChecklist(profile: ResidentProfile | null, uncertain: string[]): string[] {
  const out: string[] = [];
  if (profile) {
    for (const m of neededItems(profile.medical)) {
      out.push(
        `資料に「${m.label}」${m.night ? "（夜間も）" : ""}とある。いまも必要か、やり方や回数は変わっていないか`,
      );
    }
    if (profile.physical.fallsLastYear > 0) {
      out.push(`直近1年に${profile.physical.fallsLastYear}回の転倒がある。いつ・どんな場面で転んだか`);
    }
    const c = profile.cognition;
    if (c.wandering || c.aggression || c.careRefusal || c.nightDisturbance) {
      out.push("認知症の症状（徘徊・暴言・拒否・夜間の不穏）が出やすい時間帯ときっかけ");
    }
  }
  for (const u of uncertain) out.push(u);
  if (out.length === 0) out.push("資料にない病歴・服薬・アレルギーはないか");
  return out;
}
