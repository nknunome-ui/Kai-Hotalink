// 外部から来た入居者情報（画面の入力・AI の出力）を安全な形に整える。
import { emptyProfile, type CareLevel, type DementiaLevel, type Mobility, type ResidentProfile, type SuctionNeed } from "./types";

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
