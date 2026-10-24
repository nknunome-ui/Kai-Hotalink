// Claude API へのリクエストの形と、返ってきた JSON の解析を確かめる（API は呼ばない）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("./firebaseAdmin", () => ({ adminAuth: () => ({}) }));
vi.mock("@anthropic-ai/sdk", async (orig) => {
  // エラークラス（APIError など）は本物を使い、messages.create だけ差し替える
  const real = (await orig()) as Record<string, unknown>;
  class FakeAnthropic {
    messages = { create: state.create };
  }
  Object.assign(FakeAnthropic, real);
  return { ...real, default: FakeAnthropic };
});

const { extractProfile } = await import("./claude");

const reply = (text: string, stop_reason = "end_turn") => ({ content: [{ type: "text", text }], stop_reason });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test";
  state.create.mockReset();
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("extractProfile（Claude）", () => {
  it("強制 tool_choice を使わず structured outputs で頼み、JSON を読み取る", async () => {
    state.create.mockResolvedValue(
      reply(
        JSON.stringify({
          age: 85,
          careLevel: 5,
          medical: { suction: "night", gastrostomy: false, tracheostomy: false, oxygen: false, insulin: true, urinaryCatheter: false, dialysis: false, pressureUlcer: false },
          physical: { mobility: "partial", fallsLastYear: 2 },
          cognition: { dementiaLevel: 2, wandering: false, aggression: false, careRefusal: false, nightDisturbance: true },
          summary: "高血圧",
          uncertain: ["服薬の詳細"],
          evidence: [{ field: "careLevel", quote: "要介護3", source: "主治医意見書.pdf" }],
        }),
      ),
    );
    const r = await extractProfile([{ name: "メモ.txt", contentType: "text/plain", data: Buffer.from("要介護3") }], "");
    const params = state.create.mock.calls[0][0];
    expect(params.tool_choice).toBeUndefined();
    expect(params.tools).toBeUndefined();
    expect(params.output_config.format.type).toBe("json_schema");
    // structured outputs の制約（minimum/maximum 不可、object は additionalProperties: false）
    const schema = JSON.stringify(params.output_config.format.schema);
    expect(schema).not.toMatch(/"minimum"|"maximum"/);
    expect(r.profile).toMatchObject({ age: 85, careLevel: 5, medical: { suction: "night", insulin: true } });
    expect(r.uncertain).toEqual(["服薬の詳細"]);
    expect(r.evidence).toEqual([{ field: "careLevel", quote: "要介護3", source: "主治医意見書.pdf" }]);
  });

  it("途中で切れた・断られた・API エラーは分かる文言にする", async () => {
    state.create.mockResolvedValueOnce(reply("{", "max_tokens"));
    await expect(extractProfile([], "x")).rejects.toThrow("資料が多すぎて");
    state.create.mockResolvedValueOnce(reply("", "refusal"));
    await expect(extractProfile([], "x")).rejects.toThrow("断りました");
    const { BadRequestError } = await import("@anthropic-ai/sdk");
    state.create.mockRejectedValueOnce(
      new BadRequestError(400, { error: { message: "Your credit balance is too low" } }, "Your credit balance is too low", new Headers()),
    );
    await expect(extractProfile([], "x")).rejects.toThrow("クレジット残高が不足");
  });
});
