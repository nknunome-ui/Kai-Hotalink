import { normalizeCapabilities, normalizeCapacities } from "./medical";
import type { Acceptance, FacilitySettings, PresetId, Thresholds, Weights } from "./types";

export const PRESETS: Record<
  PresetId,
  { label: string; description: string; weights: Weights; thresholds: Thresholds }
> = {
  standard: {
    label: "標準",
    description: "医療・身体・認知を同じ重さで見る",
    weights: { medical: 1, physical: 1, cognition: 1 },
    thresholds: { a: 20, b: 40, c: 60 },
  },
  medical: {
    label: "医療重視",
    description: "医療的ケアに強い施設向け。医療項目の重みを下げる",
    weights: { medical: 0.6, physical: 1, cognition: 1 },
    thresholds: { a: 20, b: 40, c: 60 },
  },
  dementia: {
    label: "認知症ケア重視",
    description: "認知症ケアに強い施設向け。認知・行動項目の重みを下げる",
    weights: { medical: 1, physical: 1, cognition: 0.6 },
    thresholds: { a: 20, b: 40, c: 60 },
  },
};

export function defaultAcceptance(): Acceptance {
  // よくある有料老人ホーム（看護師は日中のみ）を想定した初期値
  const medical = normalizeCapabilities({
    suctionOral: "day",
    oxygen: "both",
    tubeGastric: "both",
    tubeEnteric: "both",
    tubeNasal: "both",
    infusion: "day",
    urinaryCatheter: "both",
    stoma: "both",
    urostomy: "both",
    disimpaction: "both",
    insulin: "day",
    glucose: "day",
    pressureUlcer: "both",
    woundCare: "both",
    hemodialysis: "both",
    cancerPain: "both",
    pacemaker: "both",
    terminalCare: "both",
  });
  return {
    nurseStaffing: "day",
    medical,
    capacity: {},
    maxCareLevel: 7,
    acceptsBedridden: true,
    maxDementiaLevel: 3,
    acceptsWandering: true,
    acceptsAggression: false,
    contactsMinorChanges: false,
    routineReport: true,
  };
}

export function defaultSettings(facilityName = ""): FacilitySettings {
  const p = PRESETS.standard;
  return {
    facilityName,
    contactDesk: "入居相談窓口",
    contactPhone: "",
    acceptance: defaultAcceptance(),
    preset: "standard",
    weights: { ...p.weights },
    thresholds: { ...p.thresholds },
    gapSensitivity: "normal",
  };
}

/** 設定値の範囲チェック。問題があればメッセージを返す。 */
export function validateSettings(s: FacilitySettings): string | null {
  const w = s.weights;
  for (const v of [w.medical, w.physical, w.cognition]) {
    if (typeof v !== "number" || !(v >= 0 && v <= 3)) return "重みは0〜3の範囲で指定してください";
  }
  if (w.medical + w.physical + w.cognition === 0) return "重みをすべて0にはできません";
  const t = s.thresholds;
  if (![t.a, t.b, t.c].every((v) => typeof v === "number" && v >= 0 && v <= 100)) {
    return "境目は0〜100の範囲で指定してください";
  }
  if (!(t.a <= t.b && t.b <= t.c)) return "境目は A ≦ B ≦ C の順にしてください";
  if (!["standard", "medical", "dementia"].includes(s.preset)) return "プリセットが正しくありません";
  if (!["low", "normal", "high"].includes(s.gapSensitivity)) return "ずれの表示感度が正しくありません";
  if (typeof s.facilityName !== "string" || s.facilityName.length > 100) return "施設名が正しくありません";
  if (String(s.contactDesk ?? "").length > 50 || String(s.contactPhone ?? "").length > 30) return "窓口の名前か電話番号が長すぎます";
  return null;
}

/** 既知のキーだけを残す */
export function sanitizeSettings(s: FacilitySettings): FacilitySettings | null {
  if (!s || typeof s !== "object") return null;
  const a = s.acceptance ?? ({} as FacilitySettings["acceptance"]);
  return {
    facilityName: String(s.facilityName ?? "").slice(0, 100),
    contactDesk: String(s.contactDesk ?? "").slice(0, 50),
    contactPhone: String(s.contactPhone ?? "").slice(0, 30),
    preset: s.preset,
    gapSensitivity: s.gapSensitivity,
    weights: {
      medical: Number(s.weights?.medical),
      physical: Number(s.weights?.physical),
      cognition: Number(s.weights?.cognition),
    },
    thresholds: { a: Number(s.thresholds?.a), b: Number(s.thresholds?.b), c: Number(s.thresholds?.c) },
    acceptance: sanitizeAcceptance(a as unknown as Record<string, unknown>),
  };
}

/**
 * 受け入れ範囲を整える。以前の形（suction・各項目の true/false・nightNurse）で
 * 保存された設定も、新しい形に置き換えて読む。
 */
export function sanitizeAcceptance(a: Record<string, unknown>): Acceptance {
  const b = (v: unknown) => v === true;
  const lvl = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const legacy = !a.medical || typeof a.medical !== "object";
  const staffing = (["24h", "day", "none"] as const).find((x) => x === a.nurseStaffing);
  return {
    nurseStaffing: staffing ?? (legacy ? (a.nightNurse === true ? "24h" : "day") : "day"),
    medical: normalizeCapabilities(legacy ? null : a.medical, a),
    capacity: normalizeCapacities(a.capacity),
    maxCareLevel: lvl(a.maxCareLevel, 7) as Acceptance["maxCareLevel"],
    acceptsBedridden: b(a.acceptsBedridden),
    maxDementiaLevel: lvl(a.maxDementiaLevel, 4) as Acceptance["maxDementiaLevel"],
    acceptsWandering: b(a.acceptsWandering),
    acceptsAggression: b(a.acceptsAggression),
    contactsMinorChanges: b(a.contactsMinorChanges),
    routineReport: b(a.routineReport),
  };
}
