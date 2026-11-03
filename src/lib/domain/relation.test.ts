import { describe, expect, it } from "vitest";
import { emptyInterview, type Interview } from "./interview";
import { judge } from "./judge";
import { defaultSettings } from "./presets";
import { relationRisk, signalOf } from "./relation";
import { buildReport } from "./report";
import { emptyProfile, type Gap } from "./types";

const record = (patch: Partial<Interview>): Interview => ({
  ...emptyInterview(),
  recordedAt: "2026-11-01T00:00:00.000Z",
  recordedBy: "staff@a.jp",
  ...patch,
});
const gap = (level: Gap["level"]): Gap => ({ questionId: "f_mobility", level, magnitude: 4, explain: "", kind: "perception" });

describe("カスハラ発生予測スコア（判定2）", () => {
  it("信号の境目: 30 未満は安全、60 以上は危険", () => {
    expect([signalOf(0), signalOf(29), signalOf(30), signalOf(59), signalOf(60)]).toEqual(["safe", "safe", "caution", "caution", "danger"]);
  });

  it("材料がなければ 0 点で、足りない材料を示す", () => {
    const r = relationRisk({ interview: null, answers: null, profile: emptyProfile(), gaps: [] });
    expect(r).toMatchObject({ score: 0, signal: "safe", multiplier: 1 });
    expect(r.missing).toHaveLength(2);
    expect(r.actions).toEqual([]);
  });

  it("面談の態度・要求水準と、要求が高い×暴言・暴力の組み合わせを加点し、内訳を残す", () => {
    const r = relationRisk({
      interview: record({ attitudes: ["highPressure"], demandLevel: "reportEveryInjury", bpsd: ["aggression"] }),
      answers: null,
      profile: emptyProfile(),
      gaps: [],
    });
    expect(r.factors.map((f) => [f.source, f.points])).toEqual([
      ["面談", 20],
      ["面談", 12],
      ["組み合わせ", 20],
    ]);
    expect(r).toMatchObject({ score: 52, signal: "caution" });
  });

  it("ご家族の認識と資料のギャップで係数を掛け、相談員の所感で最後に補正する", () => {
    const interview = record({ attitudes: ["interrupts"], leaveReason: "complaint", staffConcern: 5 });
    const r = relationRisk({ interview, answers: null, profile: emptyProfile(), gaps: [gap("大"), gap("中")] });
    // (18 + 15) × 1.3 + 12 = 54.9 → 55
    expect(r.multiplier).toBeCloseTo(1.3);
    expect(r.score).toBe(55);
    expect(r.factors.at(-1)).toMatchObject({ source: "所感", points: 12 });
  });

  it("アンケートの回答と自由記述の言葉も入れる。危険なら推奨アクションを受け入れ前に必要とする", () => {
    const answers = {
      f_otherFamily: "involved",
      f_reportFrequency: "daily",
      f_priority: "absoluteSafety",
      f_reason: "介護が限界で、前の施設の対応が悪かった",
    };
    const r = judge({
      residentName: "山田",
      profile: emptyProfile(),
      settings: defaultSettings(),
      answers,
      interview: record({ attitudes: ["condescending"], demandLevel: "specialTreatment", staffConcern: 4 }),
    });
    const risk = r.relation!;
    expect(risk.factors.some((f) => f.text.includes("限界"))).toBe(true);
    expect(risk.factors.some((f) => f.text.includes("対応が悪"))).toBe(true);
    expect(risk.signal).toBe("danger");
    expect(risk.actions).toContain("受け入れるかどうかを、入居判定会議で施設長と複数の職員で検討する");
    const relationActions = buildReport(r).actions.filter((a) => a.kind === "relation");
    expect(relationActions.length).toBeGreaterThan(0);
    expect(relationActions.every((a) => a.required)).toBe(true);
    // 入居判定の A〜E には影響しない
    expect(r.grade).toBe("A");
  });
});
