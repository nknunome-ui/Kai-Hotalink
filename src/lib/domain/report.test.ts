import { describe, expect, it } from "vitest";
import { judge } from "./judge";
import { defaultSettings } from "./presets";
import { buildReport } from "./report";
import { emptyProfile, type ResidentProfile } from "./types";

function profile(patch: (p: ResidentProfile) => void): ResidentProfile {
  const p = emptyProfile();
  patch(p);
  return p;
}

const settings = () => {
  const s = defaultSettings("ひだまりの家");
  s.acceptance.suction = "day";
  s.acceptance.nightNurse = false;
  return s;
};

describe("判定レポート", () => {
  it("受け入れ範囲外があれば、結論に項目名を出し、解消のための提案を先頭に置く", () => {
    const r = judge({
      residentName: "山田",
      profile: profile((p) => {
        p.careLevel = 5;
        p.medical.suction = "night";
        p.physical.fallsLastYear = 2;
      }),
      settings: settings(),
      answers: null,
    });
    const report = buildReport(r);
    expect(report.headline).toBe("施設の受け入れ範囲を超えている項目が1つあります（夜間のたん吸引）。");
    expect(report.problems[0].impact).toBe("knockout");
    expect(report.actions[0]).toMatchObject({ kind: "resolve", required: true });
    expect(report.actions[0].text).toContain("夜間のたん吸引に対応できる体制");
    expect(report.actions.some((a) => a.text.includes("家族アンケートの回答をもらい"))).toBe(true);
    expect(report.actions.at(-1)).toMatchObject({ kind: "next", text: "原因の項目を解消できるか検討" });
  });

  it("転倒リスクだけなら B、同意書の用意をやることに入れる", () => {
    const r = judge({
      residentName: "山田",
      profile: profile((p) => {
        p.physical.fallsLastYear = 1;
      }),
      settings: settings(),
      answers: null,
    });
    const report = buildReport(r);
    expect(r.grade).toBe("B");
    expect(report.headline).toBe("転倒リスクの説明と同意を済ませれば受け入れられます。");
    expect(report.actions.some((a) => a.kind === "document" && a.text.includes("転倒リスクに関するご説明と同意書"))).toBe(true);
  });

  it("提案を持たない古い判定記録でも、分野ごとの提案を出す", () => {
    const r = judge({ residentName: "山田", profile: emptyProfile(), settings: settings(), answers: null });
    r.reasons = [{ category: "cognition", impact: "knockout", text: "徘徊への対応が難しい" }];
    const report = buildReport(r);
    expect(report.headline).toContain("（徘徊）");
    expect(report.actions[0].text).toBe("認知症の症状と対応方法を面談で詳しく確認する");
  });
});
