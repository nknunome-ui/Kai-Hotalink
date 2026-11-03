import { describe, expect, it } from "vitest";
import { emptyInterview, interviewChecklist, normalizeInterview, type Interview } from "./interview";
import { judge } from "./judge";
import { defaultSettings } from "./presets";
import { emptyProfile } from "./types";

const record = (patch: Partial<Interview>): Interview => ({
  ...emptyInterview(),
  recordedAt: "2026-11-01T00:00:00.000Z",
  recordedBy: "staff@a.jp",
  ...patch,
});

describe("家族面談の記録", () => {
  it("知らない選択肢や範囲外の所感は捨てる", () => {
    expect(
      normalizeInterview({
        attitudes: ["highPressure", "unknown"],
        leaveReason: "complaint",
        demandLevel: "x",
        staffConcern: 9,
        bpsd: ["wandering", "uncleanBehavior", "y"],
        acuteRisk: "high",
      }),
    ).toEqual({
      attitudes: ["highPressure"],
      leaveReason: "complaint",
      demandLevel: null,
      familyRelation: null,
      staffConcern: null,
      bpsd: ["wandering", "uncleanBehavior"],
      acuteRisk: "high",
    });
    expect(normalizeInterview({ staffConcern: "4" }).staffConcern).toBe(4);
  });

  it("面談で確認した BPSD と急変リスクを判定に反映する", () => {
    const s = defaultSettings();
    const p = emptyProfile();
    const before = judge({ residentName: "山田", profile: p, settings: s, answers: null });
    expect(before.grade).toBe("A");

    // 暴言・暴力は施設の初期設定では受け入れていない → 受け入れ範囲外
    const after = judge({
      residentName: "山田",
      profile: p,
      settings: s,
      answers: null,
      interview: record({ bpsd: ["aggression", "uncleanBehavior"], acuteRisk: "high" }),
    });
    expect(after.grade).toBe("D");
    expect(after.reasons.map((r) => r.text)).toContain("暴言・暴力への対応が難しい");
    expect(after.reasons.some((r) => r.text.includes("急変・事故のリスクが高い"))).toBe(true);
    expect(after.reasons.find((r) => r.category === "cognition" && r.impact !== "knockout")?.text).toContain("不潔行為");
  });

  it("面談で確認することを、資料の内容から作る", () => {
    const p = emptyProfile();
    p.medical.urinaryCatheter = "day";
    p.physical.fallsLastYear = 2;
    const list = interviewChecklist(p, ["服薬の詳細が不明"]);
    expect(list[0]).toBe("資料に「尿道留置カテーテル（バルーン）」とある。いまも必要か、やり方や回数は変わっていないか");
    expect(list).toContain("直近1年に2回の転倒がある。いつ・どんな場面で転んだか");
    expect(list.at(-1)).toBe("服薬の詳細が不明");
  });
});
