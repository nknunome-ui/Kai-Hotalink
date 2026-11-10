import { normalizeCapabilities, normalizeCapacities } from "./medical";
import type { Accept, Acceptance, FacilitySettings, PresetId, Thresholds, Weights } from "./types";

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

/** 0〜size の段階のうち、max までを「受け入れる」、それより上を「受け入れない」にする */
function levelsUpTo(size: number, max: number): Record<number, Accept> {
  return Object.fromEntries(Array.from({ length: size + 1 }, (_, i) => [i, i <= max ? "yes" : "no"]));
}

const ACCEPTS: Accept[] = ["yes", "review", "no"];
/** 受け入れの可否を読む。以前の true/false も読み替える */
function acceptOf(v: unknown, fallback: Accept): Accept {
  if (ACCEPTS.includes(v as Accept)) return v as Accept;
  if (v === true) return "yes";
  if (v === false) return "no";
  return fallback;
}

/** 段階ごとの受け入れを読む。以前の「上限」（maxCareLevel など）だけの設定は、上限までを受け入れるに読み替える */
function levelsOf(v: unknown, size: number, legacyMax: unknown): Record<number, Accept> {
  if (v && typeof v === "object") {
    const m = v as Record<string, unknown>;
    return Object.fromEntries(Array.from({ length: size + 1 }, (_, i) => [i, acceptOf(m[i], "yes")]));
  }
  const max = Math.max(0, Math.min(size, Math.round(Number(legacyMax ?? size))));
  return levelsUpTo(size, Number.isFinite(max) ? max : size);
}

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
    careLevels: levelsUpTo(7, 7) as Acceptance["careLevels"],
    acceptsBedridden: "yes",
    dementiaLevels: levelsUpTo(4, 3) as Acceptance["dementiaLevels"],
    acceptsWandering: "yes",
    acceptsAggression: "no",
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
  const legacy = !a.medical || typeof a.medical !== "object";
  const staffing = (["24h", "day", "none"] as const).find((x) => x === a.nurseStaffing);
  return {
    nurseStaffing: staffing ?? (legacy ? (a.nightNurse === true ? "24h" : "day") : "day"),
    medical: normalizeCapabilities(legacy ? null : a.medical, a),
    capacity: normalizeCapacities(a.capacity),
    careLevels: levelsOf(a.careLevels, 7, a.maxCareLevel) as Acceptance["careLevels"],
    acceptsBedridden: acceptOf(a.acceptsBedridden, "no"),
    dementiaLevels: levelsOf(a.dementiaLevels, 4, a.maxDementiaLevel) as Acceptance["dementiaLevels"],
    acceptsWandering: acceptOf(a.acceptsWandering, "no"),
    acceptsAggression: acceptOf(a.acceptsAggression, "no"),
    contactsMinorChanges: b(a.contactsMinorChanges),
    routineReport: b(a.routineReport),
  };
}
