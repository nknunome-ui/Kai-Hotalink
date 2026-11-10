import { describe, expect, it } from "vitest";
import { judge, knockouts } from "./judge";
import { defaultSettings, sanitizeAcceptance } from "./presets";
import { normalizeEvidence, normalizeProfile } from "./profile";
import { emptyProfile } from "./types";

describe("以前の形で保存されたデータの読み替え", () => {
  it("入居者の状態: suction・gastrostomy などを新しい項目に読み替える", () => {
    const p = normalizeProfile({
      careLevel: 5,
      medical: { suction: "both", gastrostomy: true, dialysis: true, oxygen: false },
    });
    expect(p.medical).toMatchObject({ suctionOral: "night", tubeGastric: "day", hemodialysis: "day", oxygen: "none" });
    expect(normalizeEvidence([{ field: "suction", quote: "夜間 吸引あり", source: "追記" }])[0].field).toBe("suctionOral");
  });

  it("施設の設定: nightNurse と項目ごとの true/false を新しい形に読み替える", () => {
    const a = sanitizeAcceptance({
      suction: "day",
      gastrostomy: true,
      tracheostomy: false,
      dialysis: false,
      endOfLifeCare: true,
      nightNurse: false,
      maxCareLevel: 7,
    });
    expect(a.nurseStaffing).toBe("day");
    expect(a.medical).toMatchObject({
      suctionOral: "day",
      tubeGastric: "both",
      tubeNasal: "both",
      tracheostomy: "no",
      hemodialysis: "no",
      terminalCare: "both",
    });
    expect(sanitizeAcceptance({ nightNurse: true }).nurseStaffing).toBe("24h");
  });

  it("施設の設定: 以前の「上限」と true/false を、段階ごとの 受け入れる/検討/受け入れない に読み替える", () => {
    const a = sanitizeAcceptance({ maxCareLevel: 5, maxDementiaLevel: 2, acceptsBedridden: true, acceptsWandering: false });
    expect(a.careLevels).toEqual({ 0: "yes", 1: "yes", 2: "yes", 3: "yes", 4: "yes", 5: "yes", 6: "no", 7: "no" });
    expect(a.dementiaLevels).toEqual({ 0: "yes", 1: "yes", 2: "yes", 3: "no", 4: "no" });
    expect(a).toMatchObject({ acceptsBedridden: "yes", acceptsWandering: "no", acceptsAggression: "no" });
    const b = sanitizeAcceptance({ careLevels: { 0: "no", 1: "review", 7: "bogus" }, acceptsAggression: "review", medical: { insulin: "review" } });
    expect(b.careLevels).toMatchObject({ 0: "no", 1: "review", 2: "yes", 7: "yes" });
    expect(b.acceptsAggression).toBe("review");
    expect(b.medical.insulin).toBe("review");
  });
});

describe("医療的ケアの受け入れ", () => {
  it("夜間も必要なケアは、施設が日中のみなら受け入れ範囲外。日中だけなら問題なし", () => {
    const s = defaultSettings();
    s.acceptance.medical.insulin = "day";
    const p = emptyProfile();
    p.medical.insulin = "night";
    expect(knockouts(p, s.acceptance)[0].text).toBe("夜間のインスリン注射が必要だが、施設は夜間に対応できない");
    p.medical.insulin = "day";
    expect(knockouts(p, s.acceptance)).toHaveLength(0);
  });

  it("受け入れ枠がいっぱいなら、受け入れ範囲外として理由と提案を出す", () => {
    const s = defaultSettings();
    s.acceptance.medical.tubeGastric = "both";
    s.acceptance.capacity = { tubeGastric: { limit: 5, current: 5 } };
    const p = emptyProfile();
    p.medical.tubeGastric = "day";
    const r = judge({ residentName: "山田", profile: p, settings: s, answers: null });
    expect(r.grade).toBe("D");
    expect(r.reasons[0]).toMatchObject({ impact: "knockout", text: "経管栄養（胃ろう）の受け入れ枠がいっぱい（5/5名）" });
    s.acceptance.capacity = { tubeGastric: { limit: 5, current: 4 } };
    expect(knockouts(p, s.acceptance)).toHaveLength(0);
  });
});
