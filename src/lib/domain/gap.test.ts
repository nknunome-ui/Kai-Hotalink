import { describe, expect, it } from "vitest";
import { judge } from "./judge";
import { defaultSettings } from "./presets";
import { emptyProfile, type ResidentProfile } from "./types";

const answersBase = {
  f_applicantName: "山田 太郎",
  f_relation: "child",
  f_contact: "090",
  f_otherFamily: "none",
  f_careLevel: "unknown",
  f_mobility: "walk",
  f_eating: "self",
  f_toilet: "toilet",
  f_cognition: "clear",
  f_caregiver: "self",
  f_endOfLife: "natural",
  f_reportFrequency: "onChange",
  f_priority: "freedom",
};

const gapsOf = (p: ResidentProfile, answers: Record<string, string>) =>
  judge({ residentName: "山田", profile: p, settings: { ...defaultSettings(), gapSensitivity: "high" }, answers }).gaps;

describe("ご家族の認識と資料のギャップ", () => {
  it("ご家族が状態を軽く見ているほど大きなずれにする", () => {
    const p = emptyProfile();
    p.physical.mobility = "full"; // 資料では全介助
    const walk = gapsOf(p, { ...answersBase, f_mobility: "walk" }).find((g) => g.questionId === "f_mobility")!;
    expect(walk).toMatchObject({ kind: "perception", level: "大" });
    expect(walk.explain).toContain("ご家族は移動を「一人で歩ける」と考えているが、資料では「全介助」");
    const close = gapsOf(p, { ...answersBase, f_mobility: "wheelchairSelf" }).find((g) => g.questionId === "f_mobility")!;
    expect(close.level).toBe("中");
    // ご家族のほうが重く見ている・同じなら、ずれにしない
    expect(gapsOf(p, { ...answersBase, f_mobility: "bedridden" }).some((g) => g.questionId === "f_mobility")).toBe(false);
  });

  it("要介護度は、申請中・わからないなら比べない", () => {
    const p = emptyProfile();
    p.careLevel = 6;
    expect(gapsOf(p, { ...answersBase, f_careLevel: "unknown" }).some((g) => g.questionId === "f_careLevel")).toBe(false);
    expect(gapsOf(p, { ...answersBase, f_careLevel: "4" }).find((g) => g.questionId === "f_careLevel")?.level).toBe("大");
  });

  it("経管栄養・バルーンは、資料にあるのにご家族の答えが違えばずれにする", () => {
    const p = emptyProfile();
    p.medical.tubeGastric = "day";
    p.medical.urinaryCatheter = "day";
    const ids = gapsOf(p, answersBase).map((g) => g.questionId);
    expect(ids).toEqual(expect.arrayContaining(["f_eating", "f_toilet"]));
  });

  it("「絶対に安全」と「毎日の報告」は大きめのずれにし、同意書を用意する", () => {
    const p = emptyProfile();
    p.physical.fallsLastYear = 1;
    const r = judge({
      residentName: "山田",
      profile: p,
      settings: defaultSettings(),
      answers: { ...answersBase, f_priority: "absoluteSafety", f_reportFrequency: "daily" },
    });
    expect(r.gaps.find((g) => g.questionId === "f_priority")?.level).toBe("大");
    expect(r.gaps.find((g) => g.questionId === "f_reportFrequency")?.level).toBe("中");
    expect(r.documents.map((d) => d.kind)).toContain("fall-consent");
  });
});
