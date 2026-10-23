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
  return {
    suction: "day",
    gastrostomy: true,
    tracheostomy: false,
    oxygen: true,
    insulin: true,
    urinaryCatheter: true,
    dialysis: false,
    pressureUlcer: true,
    maxCareLevel: 7,
    acceptsBedridden: true,
    maxDementiaLevel: 3,
    acceptsWandering: true,
    acceptsAggression: false,
    nightNurse: false,
    endOfLifeCare: true,
    contactsMinorChanges: false,
    routineReport: true,
  };
}

export function defaultSettings(facilityName = ""): FacilitySettings {
  const p = PRESETS.standard;
  return {
    facilityName,
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
  return null;
}

/** 既知のキーだけを残す */
export function sanitizeSettings(s: FacilitySettings): FacilitySettings | null {
  if (!s || typeof s !== "object") return null;
  const a = s.acceptance ?? ({} as FacilitySettings["acceptance"]);
  const b = (v: unknown) => v === true;
  const lvl = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  return {
    facilityName: String(s.facilityName ?? "").slice(0, 100),
    preset: s.preset,
    gapSensitivity: s.gapSensitivity,
    weights: {
      medical: Number(s.weights?.medical),
      physical: Number(s.weights?.physical),
      cognition: Number(s.weights?.cognition),
    },
    thresholds: { a: Number(s.thresholds?.a), b: Number(s.thresholds?.b), c: Number(s.thresholds?.c) },
    acceptance: {
      suction: (["none", "day", "both"] as const).includes(a.suction) ? a.suction : "none",
      gastrostomy: b(a.gastrostomy),
      tracheostomy: b(a.tracheostomy),
      oxygen: b(a.oxygen),
      insulin: b(a.insulin),
      urinaryCatheter: b(a.urinaryCatheter),
      dialysis: b(a.dialysis),
      pressureUlcer: b(a.pressureUlcer),
      maxCareLevel: lvl(a.maxCareLevel, 7) as FacilitySettings["acceptance"]["maxCareLevel"],
      acceptsBedridden: b(a.acceptsBedridden),
      maxDementiaLevel: lvl(a.maxDementiaLevel, 4) as FacilitySettings["acceptance"]["maxDementiaLevel"],
      acceptsWandering: b(a.acceptsWandering),
      acceptsAggression: b(a.acceptsAggression),
      nightNurse: b(a.nightNurse),
      endOfLifeCare: b(a.endOfLifeCare),
      contactsMinorChanges: b(a.contactsMinorChanges),
      routineReport: b(a.routineReport),
    },
  };
}
