// 外部から来た入居者情報（画面の入力・AI の出力）を安全な形に整える。
import {
  CARE_LEVEL_LABELS,
  DEMENTIA_LABELS,
  MOBILITY_LABELS,
  PROFILE_FIELDS,
  emptyProfile,
  type CareLevel,
  type DementiaLevel,
  type Evidence,
  type Mobility,
  type ProfileField,
  type ResidentProfile,
  type SuctionNeed,
} from "./types";

const SUCTION: SuctionNeed[] = ["none", "day", "night", "both"];
const MOBILITY: Mobility[] = ["independent", "supervision", "partial", "full", "bedridden"];

const bool = (v: unknown) => v === true;
const intIn = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

export function normalizeProfile(input: unknown): ResidentProfile {
  const base = emptyProfile();
  if (!input || typeof input !== "object") return base;
  const i = input as Record<string, unknown>;
  const m = (i.medical ?? {}) as Record<string, unknown>;
  const ph = (i.physical ?? {}) as Record<string, unknown>;
  const c = (i.cognition ?? {}) as Record<string, unknown>;

  const age = i.age === null || i.age === undefined || i.age === "" ? null : intIn(i.age, 0, 130, 0);

  return {
    age,
    careLevel: intIn(i.careLevel, 0, 7, 0) as CareLevel,
    medical: {
      suction: SUCTION.includes(m.suction as SuctionNeed) ? (m.suction as SuctionNeed) : "none",
      gastrostomy: bool(m.gastrostomy),
      tracheostomy: bool(m.tracheostomy),
      oxygen: bool(m.oxygen),
      insulin: bool(m.insulin),
      urinaryCatheter: bool(m.urinaryCatheter),
      dialysis: bool(m.dialysis),
      pressureUlcer: bool(m.pressureUlcer),
    },
    physical: {
      mobility: MOBILITY.includes(ph.mobility as Mobility) ? (ph.mobility as Mobility) : "independent",
      fallsLastYear: intIn(ph.fallsLastYear, 0, 99, 0),
    },
    cognition: {
      dementiaLevel: intIn(c.dementiaLevel, 0, 4, 0) as DementiaLevel,
      wandering: bool(c.wandering),
      aggression: bool(c.aggression),
      careRefusal: bool(c.careRefusal),
      nightDisturbance: bool(c.nightDisturbance),
    },
    summary: typeof i.summary === "string" ? i.summary.slice(0, 4000) : "",
  };
}

/** AI が返した根拠を、知っている項目だけ・短く整えて残す（1項目1件） */
export function normalizeEvidence(input: unknown): Evidence[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<ProfileField>();
  const out: Evidence[] = [];
  for (const e of input) {
    if (!e || typeof e !== "object") continue;
    const { field, quote, source } = e as Record<string, unknown>;
    if (!PROFILE_FIELDS.includes(field as ProfileField) || seen.has(field as ProfileField)) continue;
    if (typeof quote !== "string" || !quote.trim()) continue;
    seen.add(field as ProfileField);
    out.push({
      field: field as ProfileField,
      quote: quote.trim().slice(0, 160),
      source: typeof source === "string" && source.trim() ? source.trim().slice(0, 80) : "資料",
    });
  }
  return out;
}

const YES_NO = (v: boolean) => (v ? "あり" : "なし");
const SUCTION_TEXT: Record<SuctionNeed, string> = { none: "不要", day: "日中のみ", night: "夜間", both: "日中・夜間" };

/** 項目の値を画面表示用の文字にする（AI の値と比べて見せるため） */
export function fieldText(p: ResidentProfile, f: ProfileField): string {
  switch (f) {
    case "age":
      return p.age === null ? "不明" : `${p.age}歳`;
    case "careLevel":
      return CARE_LEVEL_LABELS[p.careLevel];
    case "suction":
      return SUCTION_TEXT[p.medical.suction];
    case "mobility":
      return MOBILITY_LABELS[p.physical.mobility];
    case "fallsLastYear":
      return `${p.physical.fallsLastYear}回`;
    case "dementiaLevel":
      return DEMENTIA_LABELS[p.cognition.dementiaLevel].replace(/（.*）/, "");
    case "gastrostomy":
    case "tracheostomy":
    case "oxygen":
    case "insulin":
    case "urinaryCatheter":
    case "dialysis":
    case "pressureUlcer":
      return YES_NO(p.medical[f]);
    case "wandering":
    case "aggression":
    case "careRefusal":
    case "nightDisturbance":
      return YES_NO(p.cognition[f]);
  }
}
