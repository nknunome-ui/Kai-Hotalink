import { describe, expect, it } from "vitest";
import { judge, knockouts, categoryScores, filterGaps } from "./judge";
import { defaultSettings, PRESETS, validateSettings } from "./presets";
import { buildSurvey, surveyByIds, validateAnswers } from "./survey";
import { emptyProfile, type ResidentProfile } from "./types";

function profile(patch: (p: ResidentProfile) => void): ResidentProfile {
  const p = emptyProfile();
  patch(p);
  return p;
}

const settings = () => {
  const s = defaultSettings("ひだまりの家");
  s.acceptance.medical.suctionOral = "day";
  s.acceptance.nurseStaffing = "day";
  return s;
};

describe("足切り", () => {
  it("企画書の例: 夜間のたん吸引が必要で施設が日中のみ → D と原因", () => {
    const p = profile((p) => {
      p.careLevel = 5;
      p.medical.suctionOral = "night";
      p.physical.fallsLastYear = 2;
    });
    const r = judge({ residentName: "山田", profile: p, settings: settings(), answers: null });
    expect(r.grade).toBe("D");
    expect(r.reasons[0]).toMatchObject({ impact: "knockout", text: "夜間の喀痰吸引（口腔内・鼻腔内）が必要だが、施設は夜間に対応できない" });
    expect(r.documents).toHaveLength(0);
  });

  it("足切り2つ以上 → E", () => {
    const p = profile((p) => {
      p.medical.tppv = "day";
      p.medical.tracheostomy = "day";
    });
    expect(knockouts(p, settings().acceptance)).toHaveLength(2);
    expect(judge({ residentName: "", profile: p, settings: settings(), answers: null }).grade).toBe("E");
  });

  it("要介護度の範囲外（上も下も）", () => {
    const s = settings();
    s.acceptance.careLevels[7] = "no";
    s.acceptance.careLevels[0] = "no"; // 自立の方は受け入れない
    expect(knockouts(profile((p) => (p.careLevel = 7)), s.acceptance)[0].text).toContain("要介護5");
    expect(knockouts(profile((p) => (p.careLevel = 0)), s.acceptance)[0]).toMatchObject({ impact: "knockout", text: "要介護度（自立）が受け入れ範囲外" });
    expect(knockouts(profile((p) => (p.careLevel = 1)), s.acceptance)).toHaveLength(0);
  });

  it("「検討」にした項目に当てはまると、点数がよくても C。受け入れ範囲外があれば D のまま", () => {
    const s = settings();
    s.acceptance.careLevels[6] = "review";
    s.acceptance.medical.insulin = "review";
    const p = profile((p) => (p.careLevel = 6));
    const r = judge({ residentName: "", profile: p, settings: s, answers: null });
    expect(r.grade).toBe("C");
    expect(r.reasons[0]).toMatchObject({ impact: "review", text: "要介護度（要介護4）は、施設で「検討」にしている範囲" });

    p.medical.insulin = "day";
    expect(knockouts(p, s.acceptance).filter((x) => x.impact === "review")).toHaveLength(2);
    p.medical.tppv = "day";
    expect(judge({ residentName: "", profile: p, settings: s, answers: null }).grade).toBe("D");
  });
});

describe("項目スコアと ABCDE", () => {
  it("自立の方は A", () => {
    const r = judge({ residentName: "", profile: emptyProfile(), settings: settings(), answers: null });
    expect(r.grade).toBe("A");
    expect(r.riskScore).toBe(0);
  });

  it("企画書の例: たん吸引不要・転倒リスクあり → 転倒で B、同意書を作成", () => {
    const p = profile((p) => {
      p.careLevel = 5;
      p.physical.fallsLastYear = 2;
    });
    const r = judge({ residentName: "山田", profile: p, settings: settings(), answers: null });
    expect(r.grade).toBe("B");
    expect(r.documents.map((d) => d.kind)).toContain("fall-consent");
    expect(r.documents.find((d) => d.kind === "fall-consent")!.body).toContain("山田様");
  });

  it("スコアは各カテゴリ 10 で頭打ち", () => {
    const p = profile((p) => {
      p.medical.tubeGastric = "day";
      p.medical.tracheostomy = "day";
      p.medical.oxygen = "day";
      p.medical.hemodialysis = "day";
    });
    expect(categoryScores(p).medical).toBe(10);
  });

  it("プリセットで重みを変えると判定が変わる", () => {
    const p = profile((p) => {
      p.cognition.dementiaLevel = 3;
      p.cognition.wandering = true;
      p.physical.mobility = "full";
    });
    const std = settings();
    const dem = settings();
    dem.weights = { ...PRESETS.dementia.weights };
    const a = judge({ residentName: "", profile: p, settings: std, answers: null });
    const b = judge({ residentName: "", profile: p, settings: dem, answers: null });
    expect(b.riskScore).toBeLessThan(a.riskScore);
  });

  it("同じ入力なら同じ結果", () => {
    const p = profile((p) => (p.medical.oxygen = "day"));
    const r1 = judge({ residentName: "", profile: p, settings: settings(), answers: null });
    const r2 = judge({ residentName: "", profile: p, settings: settings(), answers: null });
    expect(r1).toEqual(r2);
  });
});

describe("期待値のずれ", () => {
  const severe = profile((p) => {
    p.careLevel = 7;
    p.medical.tubeGastric = "day";
    p.medical.suctionOral = "day";
    p.physical.mobility = "bedridden";
  });

  it("家族の回答は ABCDE に影響しない", () => {
    const s = settings();
    const calm = judge({ residentName: "", profile: severe, settings: s, answers: { q5_endOfLife: "consult" } });
    const gap = judge({ residentName: "", profile: severe, settings: s, answers: { q5_endOfLife: "allTreatment", q7_differentCare: "familyFirst" } });
    expect(gap.grade).toBe(calm.grade);
    expect(gap.riskScore).toBe(calm.riskScore);
  });

  it("重篤 × すべての医療処置を希望 → ずれ大（掛け合わせ）", () => {
    const r = judge({ residentName: "", profile: severe, settings: settings(), answers: { q5_endOfLife: "allTreatment" } });
    expect(r.gaps[0]).toMatchObject({ questionId: "q5_endOfLife", level: "中" });
    const light = judge({ residentName: "", profile: emptyProfile(), settings: { ...settings(), gapSensitivity: "high" }, answers: { q5_endOfLife: "allTreatment" } });
    expect(light.gaps[0].magnitude).toBeLessThan(r.gaps[0].magnitude);
  });

  it("丁寧な説明の希望はリスク扱いしない", () => {
    const r = judge({ residentName: "", profile: emptyProfile(), settings: { ...settings(), gapSensitivity: "high" }, answers: { q7_differentCare: "explain" } });
    expect(r.gaps).toHaveLength(0);
    expect(r.wishes).toContain("ケアの提案は、理由を十分に説明してから決めてほしい");
  });

  it("夜間看護師がいない施設で急変時に家族連絡を優先したい → ずれ", () => {
    const r = judge({ residentName: "", profile: severe, settings: settings(), answers: { q6_emergency: "contactFirst" } });
    expect(r.gaps.some((g) => g.questionId === "q6_emergency" && g.level === "大")).toBe(true);
  });

  it("表示感度で小さなずれを隠す", () => {
    const gaps = [
      { questionId: "a", level: "大" as const, magnitude: 5, explain: "" },
      { questionId: "b", level: "小" as const, magnitude: 1, explain: "" },
    ];
    expect(filterGaps(gaps, "low")).toHaveLength(1);
    expect(filterGaps(gaps, "high")).toHaveLength(2);
  });
});

describe("アンケート", () => {
  it("医療的ケアがあると急変時の設問を追加（動的生成）", () => {
    expect(buildSurvey(emptyProfile()).some((q) => q.id === "q6_emergency")).toBe(false);
    const p = profile((p) => (p.medical.tubeGastric = "day"));
    expect(buildSurvey(p).some((q) => q.id === "q6_emergency")).toBe(true);
  });

  it("以前のアンケート: 必須未回答・不正な値・選択数超過を弾く", () => {
    const qs = surveyByIds(["q1_expectation", "q2_habits", "q3_falls", "q4_contact", "q5_endOfLife", "q7_differentCare", "q8_pastExperience"]);
    expect(validateAnswers(qs, {})).toContain("未回答");
    const ok = {
      q1_expectation: ["safety"],
      q2_habits: "withinRules",
      q3_falls: "accept",
      q4_contact: ["incident"],
      q5_endOfLife: "consult",
      q7_differentCare: "collaborate",
    };
    expect(validateAnswers(qs, ok)).toBeNull();
    expect(validateAnswers(qs, { ...ok, q3_falls: "hack" })).not.toBeNull();
    expect(validateAnswers(qs, { ...ok, q1_expectation: ["safety", "medical", "wishes"] })).toContain("2つまで");
  });
});

describe("設定のチェック", () => {
  it("境目の順番と範囲", () => {
    const s = settings();
    expect(validateSettings(s)).toBeNull();
    expect(validateSettings({ ...s, thresholds: { a: 50, b: 40, c: 60 } })).not.toBeNull();
    expect(validateSettings({ ...s, weights: { medical: 0, physical: 0, cognition: 0 } })).not.toBeNull();
  });
});
