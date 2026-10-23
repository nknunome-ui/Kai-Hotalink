import { describe, expect, it } from "vitest";
import { judge, knockouts, categoryScores, filterGaps } from "./judge";
import { defaultSettings, PRESETS, validateSettings } from "./presets";
import { buildSurvey, validateAnswers } from "./survey";
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

describe("足切り", () => {
  it("企画書の例: 夜間のたん吸引が必要で施設が日中のみ → D と原因", () => {
    const p = profile((p) => {
      p.careLevel = 5;
      p.medical.suction = "night";
      p.physical.fallsLastYear = 2;
    });
    const r = judge({ residentName: "山田", profile: p, settings: settings(), answers: null });
    expect(r.grade).toBe("D");
    expect(r.reasons[0]).toMatchObject({ impact: "knockout", text: "夜間のたん吸引が必要だが、施設は夜間に対応できない" });
    expect(r.documents).toHaveLength(0);
  });

  it("足切り2つ以上 → E", () => {
    const p = profile((p) => {
      p.medical.dialysis = true;
      p.medical.tracheostomy = true;
    });
    expect(knockouts(p, settings().acceptance)).toHaveLength(2);
    expect(judge({ residentName: "", profile: p, settings: settings(), answers: null }).grade).toBe("E");
  });

  it("要介護度の上限超え", () => {
    const s = settings();
    s.acceptance.maxCareLevel = 5;
    const p = profile((p) => (p.careLevel = 7));
    expect(knockouts(p, s.acceptance)[0].text).toContain("要介護5");
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
      p.medical.gastrostomy = true;
      p.medical.tracheostomy = true;
      p.medical.oxygen = true;
      p.medical.dialysis = true;
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
    const p = profile((p) => (p.medical.oxygen = true));
    const r1 = judge({ residentName: "", profile: p, settings: settings(), answers: null });
    const r2 = judge({ residentName: "", profile: p, settings: settings(), answers: null });
    expect(r1).toEqual(r2);
  });
});

describe("期待値のずれ", () => {
  const severe = profile((p) => {
    p.careLevel = 7;
    p.medical.gastrostomy = true;
    p.medical.suction = "day";
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
    const p = profile((p) => (p.medical.gastrostomy = true));
    expect(buildSurvey(p).some((q) => q.id === "q6_emergency")).toBe(true);
  });

  it("必須未回答・不正な値・選択数超過を弾く", () => {
    const qs = buildSurvey(null);
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
