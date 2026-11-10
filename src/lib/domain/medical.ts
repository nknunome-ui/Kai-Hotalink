// 医療的ケアの項目一覧。入居者に必要なケアと、施設が受け入れられるケアの両方に使う。
// night: 夜間（20:00〜6:00）も対応が必要になりうる項目。施設側は「日中のみ」を選べる。

export const MEDICAL_GROUPS = [
  { id: "respiratory", label: "呼吸・気道系" },
  { id: "nutrition", label: "栄養・水分補給系" },
  { id: "excretion", label: "排泄系" },
  { id: "treatment", label: "日常の処置・創傷ケア" },
  { id: "special", label: "特殊管理・その他" },
] as const;
export type MedicalGroupId = (typeof MEDICAL_GROUPS)[number]["id"];

export const MEDICAL_CARE = [
  { id: "suctionOral", label: "喀痰吸引（口腔内・鼻腔内）", group: "respiratory", points: 3, night: true },
  { id: "suctionTracheal", label: "喀痰吸引（気管カニューレ内部）", group: "respiratory", points: 4, night: true },
  { id: "tracheostomy", label: "気管切開の管理", group: "respiratory", points: 4, night: false },
  { id: "oxygen", label: "在宅酸素療法（HOT）", group: "respiratory", points: 2, night: false },
  { id: "nppv", label: "人工呼吸器（NPPV：マスク型）", group: "respiratory", points: 4, night: false },
  { id: "tppv", label: "人工呼吸器（TPPV：気管切開型）", group: "respiratory", points: 6, night: false },
  { id: "tubeGastric", label: "経管栄養（胃ろう）", group: "nutrition", points: 3, night: false },
  { id: "tubeEnteric", label: "経管栄養（腸ろう）", group: "nutrition", points: 3, night: false },
  { id: "tubeNasal", label: "経管栄養（経鼻）", group: "nutrition", points: 3, night: false },
  { id: "ivh", label: "中心静脈栄養（IVH・TPN）", group: "nutrition", points: 4, night: false },
  { id: "infusion", label: "点滴・静脈注射", group: "nutrition", points: 2, night: true },
  { id: "urinaryCatheter", label: "尿道留置カテーテル（バルーン）", group: "excretion", points: 1, night: false },
  { id: "stoma", label: "人工肛門（ストーマ）", group: "excretion", points: 1, night: false },
  { id: "urostomy", label: "人工膀胱（ウロストーマ）", group: "excretion", points: 1, night: false },
  { id: "disimpaction", label: "摘便・浣腸", group: "excretion", points: 1, night: false },
  { id: "insulin", label: "インスリン注射", group: "treatment", points: 2, night: true },
  { id: "glucose", label: "血糖値の測定・管理", group: "treatment", points: 1, night: true },
  { id: "pressureUlcer", label: "褥瘡（床ずれ）の処置", group: "treatment", points: 2, night: false },
  { id: "woundCare", label: "創傷・皮膚疾患の処置", group: "treatment", points: 1, night: false },
  { id: "hemodialysis", label: "人工透析（通院）", group: "special", points: 3, night: false },
  { id: "capd", label: "腹膜透析（CAPD）", group: "special", points: 3, night: false },
  { id: "cancerPain", label: "がん性疼痛の管理（医療用麻薬）", group: "special", points: 3, night: false },
  { id: "infection", label: "感染症の隔離対応", group: "special", points: 2, night: false },
  { id: "pacemaker", label: "ペースメーカーの管理", group: "special", points: 1, night: false },
  { id: "terminalCare", label: "ターミナルケア・看取り", group: "special", points: 3, night: false },
  { id: "intractable", label: "指定難病・神経難病（ALS など）", group: "special", points: 3, night: false },
] as const satisfies readonly {
  id: string;
  label: string;
  group: MedicalGroupId;
  points: number;
  night: boolean;
}[];

export type MedicalCareId = (typeof MEDICAL_CARE)[number]["id"];
export const MEDICAL_IDS = MEDICAL_CARE.map((m) => m.id) as MedicalCareId[];
export const medicalItem = (id: MedicalCareId) => MEDICAL_CARE.find((m) => m.id === id)!;

/** 入居者に必要か: none=不要, day=必要（夜間は不要）, night=夜間も必要 */
export type MedicalNeed = "none" | "day" | "night";
/** 施設が受け入れられるか: no=受け入れない, day=日中のみ, both=日中・夜間とも */
/** review: 施設内で検討する（判定は C まで） */
export type MedicalCapability = "no" | "review" | "day" | "both";

export type MedicalNeeds = Record<MedicalCareId, MedicalNeed>;
export type MedicalCapabilities = Record<MedicalCareId, MedicalCapability>;

/** 看護師の配置: 24時間常駐 / 日中のみ（夜間はオンコール） / 配置なし */
export type NurseStaffing = "24h" | "day" | "none";
export const NURSE_STAFFING_LABELS: Record<NurseStaffing, string> = {
  "24h": "24時間常駐",
  day: "日中のみ常駐（夜間はオンコール）",
  none: "配置なし",
};

export function emptyNeeds(): MedicalNeeds {
  return Object.fromEntries(MEDICAL_IDS.map((id) => [id, "none"])) as MedicalNeeds;
}

/** 必要な医療的ケアの一覧（画面・判定理由の表示用） */
export function neededItems(needs: MedicalNeeds): { id: MedicalCareId; label: string; night: boolean }[] {
  return MEDICAL_CARE.filter((m) => needs[m.id] !== "none").map((m) => ({
    id: m.id,
    label: m.label,
    night: needs[m.id] === "night",
  }));
}

const NEEDS: MedicalNeed[] = ["none", "day", "night"];
const CAPS: MedicalCapability[] = ["no", "review", "day", "both"];

/**
 * 入居者の医療的ケアを整える。以前の形（suction・gastrostomy などの項目）で
 * 保存されたデータも、新しい項目に置き換えて読む。
 */
export function normalizeNeeds(input: unknown): MedicalNeeds {
  const out = emptyNeeds();
  if (!input || typeof input !== "object") return out;
  const m = input as Record<string, unknown>;
  for (const item of MEDICAL_CARE) {
    const v = m[item.id];
    if (NEEDS.includes(v as MedicalNeed)) out[item.id] = !item.night && v === "night" ? "day" : (v as MedicalNeed);
  }
  // 以前の形からの読み替え
  if (m.suction === "day" || m.suction === "night" || m.suction === "both") {
    out.suctionOral = m.suction === "day" ? "day" : "night";
  }
  const legacy: [string, MedicalCareId][] = [
    ["gastrostomy", "tubeGastric"],
    ["tracheostomy", "tracheostomy"],
    ["oxygen", "oxygen"],
    ["insulin", "insulin"],
    ["urinaryCatheter", "urinaryCatheter"],
    ["dialysis", "hemodialysis"],
    ["pressureUlcer", "pressureUlcer"],
  ];
  for (const [old, id] of legacy) if (m[old] === true) out[id] = "day";
  return out;
}

/** 施設の受け入れ範囲を整える。以前の形（suction と各項目の true/false）も読む。 */
export function normalizeCapabilities(input: unknown, legacyAcceptance?: Record<string, unknown>): MedicalCapabilities {
  const out = Object.fromEntries(MEDICAL_IDS.map((id) => [id, "no"])) as MedicalCapabilities;
  const m = (input && typeof input === "object" ? input : null) as Record<string, unknown> | null;
  if (m) {
    for (const item of MEDICAL_CARE) {
      const v = m[item.id];
      if (CAPS.includes(v as MedicalCapability)) out[item.id] = !item.night && v === "day" ? "both" : (v as MedicalCapability);
    }
    return out;
  }
  const a = legacyAcceptance ?? {};
  if (a.suction === "day" || a.suction === "both") {
    out.suctionOral = a.suction as MedicalCapability;
    out.suctionTracheal = a.suction as MedicalCapability;
  }
  const legacy: [string, MedicalCareId[]][] = [
    ["gastrostomy", ["tubeGastric", "tubeEnteric", "tubeNasal"]],
    ["tracheostomy", ["tracheostomy"]],
    ["oxygen", ["oxygen"]],
    ["insulin", ["insulin", "glucose"]],
    ["urinaryCatheter", ["urinaryCatheter"]],
    ["dialysis", ["hemodialysis"]],
    ["pressureUlcer", ["pressureUlcer", "woundCare"]],
    ["endOfLifeCare", ["terminalCare"]],
  ];
  for (const [old, ids] of legacy) if (a[old] === true) for (const id of ids) out[id] = "both";
  return out;
}

/** 受け入れ人数の枠（任意）。limit 名まで、いま current 名が入居中。 */
export interface CareCapacity {
  limit: number;
  current: number;
}
export type CareCapacities = Partial<Record<MedicalCareId, CareCapacity>>;

export function normalizeCapacities(input: unknown): CareCapacities {
  const out: CareCapacities = {};
  if (!input || typeof input !== "object") return out;
  const num = (v: unknown) => Math.max(0, Math.min(999, Math.round(Number(v) || 0)));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!MEDICAL_IDS.includes(k as MedicalCareId) || !v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    out[k as MedicalCareId] = { limit: num(c.limit), current: num(c.current) };
  }
  return out;
}
