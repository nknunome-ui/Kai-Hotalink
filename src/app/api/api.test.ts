// API の通しテスト。Firebase の代わりにメモリ上の DB・偽の認証・偽のストレージを使う。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/server/memoryDb";

const state = vi.hoisted(() => ({ mem: null as unknown as MemoryDb, files: new Map<string, { contentType: string; size: number }>() }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  db: () => state.mem,
  adminAuth: () => ({
    verifyIdToken: async (token: string) => {
      const users: Record<string, object> = {
        "admin-a": { uid: "u1", email: "admin@a.jp", facilityId: "fa", role: "admin" },
        "staff-a": { uid: "u2", email: "staff@a.jp", facilityId: "fa", role: "staff" },
        "staff-b": { uid: "u3", email: "staff@b.jp", facilityId: "fb", role: "staff" },
        "no-facility": { uid: "u4", email: "x@x.jp" },
      };
      if (!users[token]) throw new Error("invalid");
      return users[token];
    },
  }),
  bucket: () => ({
    file: (path: string) => ({
      exists: async () => [state.files.has(path)],
      getMetadata: async () => [state.files.get(path)],
      download: async () => [Buffer.from("dummy")],
      delete: async () => void state.files.delete(path),
    }),
  }),
}));

const residents = await import("./residents/route");
const resident = await import("./residents/[id]/route");
const extract = await import("./residents/[id]/extract/route");
const judgeRoute = await import("./residents/[id]/judge/route");
const surveyLink = await import("./residents/[id]/survey-link/route");
const documents = await import("./residents/[id]/documents/route");
const settings = await import("./settings/route");
const history = await import("./settings/history/route");
const simulate = await import("./settings/simulate/route");
const survey = await import("./survey/[token]/route");
const { defaultSettings } = await import("@/lib/domain/presets");

const req = (token: string | null, body?: unknown, method = body ? "POST" : "GET", url = "http://localhost/api") =>
  new Request(url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) }) as never;
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  state.mem = new MemoryDb();
  state.files.clear();
  delete process.env.ANTHROPIC_API_KEY;
});

async function newResident(token = "admin-a", name = "山田 花子") {
  const r = await json(await residents.POST(req(token, { name })));
  expect(r.status).toBe(201);
  return r.body.resident.id as string;
}

describe("認証と施設の分離", () => {
  it("トークンなしは 401、施設未登録は 403", async () => {
    expect((await residents.GET(req(null))).status).toBe(401);
    expect((await residents.GET(req("bad"))).status).toBe(401);
    expect((await residents.GET(req("no-facility"))).status).toBe(403);
  });

  it("他施設の入居者は見えない", async () => {
    const id = await newResident("admin-a");
    expect((await resident.GET(req("staff-a"), params({ id }))).status).toBe(200);
    expect((await resident.GET(req("staff-b"), params({ id }))).status).toBe(404);
    const listB = await json(await residents.GET(req("staff-b")));
    expect(listB.body.residents).toHaveLength(0);
  });

  it("スタッフは設定を変えられない", async () => {
    const res = await settings.PUT(req("staff-a", { settings: defaultSettings("x") }, "PUT"));
    expect(res.status).toBe(403);
  });

  it("他施設のパスの資料は登録できない", async () => {
    const id = await newResident();
    const path = `facilities/fb/residents/${id}/x.pdf`;
    state.files.set(path, { contentType: "application/pdf", size: 10 });
    const res = await documents.POST(req("admin-a", { path, name: "x.pdf" }), params({ id }));
    expect(res.status).toBe(400);
  });

  it("許可されていない形式の資料は登録せず削除する", async () => {
    const id = await newResident();
    const path = `facilities/fa/residents/${id}/x.exe`;
    state.files.set(path, { contentType: "application/octet-stream", size: 10 });
    expect((await documents.POST(req("admin-a", { path }), params({ id }))).status).toBe(400);
    expect(state.files.has(path)).toBe(false);
  });
});

describe("入居判定の通しの流れ", () => {
  it("設定 → 登録 → AI読み取り → 確認 → アンケート → 判定", async () => {
    // 施設の設定（管理者）
    const s = defaultSettings("ひだまりの家");
    s.acceptance.suction = "day";
    s.acceptance.nightNurse = false;
    const saved = await json(await settings.PUT(req("admin-a", { settings: s }, "PUT")));
    expect(saved.body.version).toBe(1);
    const h = await json(await history.GET(req("staff-a")));
    expect(h.body.history[0]).toMatchObject({ version: 1, changedBy: "admin@a.jp" });

    // 入居者を登録し、追記を保存して読み取り（APIキーなし＝ダミー）
    const id = await newResident();
    await resident.PATCH(req("staff-a", { staffNotes: "要介護3。夜間 吸引あり。転倒 2回。" }, "PATCH"), params({ id }));
    const ex = await json(await extract.POST(req("staff-a", {}), params({ id })));
    expect(ex.status).toBe(200);
    expect(ex.body.resident.profile).toMatchObject({ careLevel: 5, medical: { suction: "night" }, physical: { fallsLastYear: 2 } });
    expect(ex.body.resident.profileConfirmed).toBe(false);
    // 根拠（ダミーは追記からの抜き書き）と、AI が読み取った値を残す
    expect(ex.body.resident.extraction.evidence).toContainEqual(
      expect.objectContaining({ field: "suction", source: "スタッフの追記" }),
    );
    expect(ex.body.resident.extraction.profile).toEqual(ex.body.resident.profile);

    // 未確認のままでは判定できない
    expect((await judgeRoute.POST(req("staff-a", {}), params({ id }))).status).toBe(400);

    // スタッフが確認して修正（実は吸引は不要だった）
    const fixed = { ...ex.body.resident.profile, medical: { ...ex.body.resident.profile.medical, suction: "none" } };
    const patched = await json(await resident.PATCH(req("staff-a", { profile: fixed }, "PATCH"), params({ id })));
    expect(patched.body.resident.profileConfirmed).toBe(true);

    // アンケートURL発行（医療的ケアなし → 急変時の設問は出ない）
    const link = await json(await surveyLink.POST(req("staff-a", {}), params({ id })));
    const token = link.body.url.split("/survey/")[1];
    expect(token.length).toBeGreaterThan(20);
    expect(JSON.stringify(state.mem.store)).not.toContain(token); // トークンそのものは保存しない
    const sv = await json(await survey.GET(req(null), params({ token })));
    expect(sv.body).toMatchObject({ facilityName: "ひだまりの家", residentName: "山田 花子", submitted: false });
    expect(sv.body.questions.map((q: { id: string }) => q.id)).not.toContain("q6_emergency");
    expect(JSON.stringify(sv.body)).not.toContain("careLevel"); // 状態は家族側に返さない

    // 不正な回答は弾く、正しい回答は1回だけ受け付ける
    expect((await survey.POST(req(null, { answers: { q1_expectation: ["safety"] } }), params({ token }))).status).toBe(400);
    const answers = {
      q1_expectation: ["safety"],
      q2_habits: "withinRules",
      q3_falls: "noInjury",
      q4_contact: ["incident", "everyChange"],
      q5_endOfLife: "consult",
      q7_differentCare: "explain",
      q8_pastExperience: "前の施設では連絡が遅かった",
      unknownKey: "捨てられる",
    };
    expect((await survey.POST(req(null, { answers }), params({ token }))).status).toBe(200);
    expect((await survey.POST(req(null, { answers }), params({ token }))).status).toBe(409);

    // 判定
    const j = await json(await judgeRoute.POST(req("staff-a", {}), params({ id })));
    expect(j.status).toBe(200);
    const result = j.body.judgment.result;
    expect(result.grade).toBe("B");
    expect(result.gaps.map((g: { questionId: string }) => g.questionId)).toContain("q3_falls");
    expect(result.wishes).toContain("ケアの提案は、理由を十分に説明してから決めてほしい");
    expect(result.documents.map((d: { kind: string }) => d.kind)).toEqual(expect.arrayContaining(["fall-consent", "special-clauses"]));
    expect(j.body.judgment.settingsVersion).toBe(1);
    expect(j.body.judgment.pastExperienceSummary).toContain("連絡が遅かった");

    const detail = await json(await resident.GET(req("staff-a"), params({ id })));
    expect(detail.body.resident.latestJudgment.grade).toBe("B");
    expect(detail.body.resident.survey.answers.unknownKey).toBeUndefined();
    expect(detail.body.resident.survey.tokenHash).toBeUndefined();
    expect(detail.body.judgments).toHaveLength(1);

    // 設定の試算: 足切りを厳しくすると判定が変わる
    const strict = { ...s, acceptance: { ...s.acceptance, maxCareLevel: 4 } };
    const sim = await json(await simulate.POST(req("staff-a", { settings: strict })));
    expect(sim.body.rows[0]).toMatchObject({ before: { grade: "B" }, after: { grade: "D" } });
  });

  it("医療的ケアがあると急変時の設問が追加される", async () => {
    const id = await newResident();
    const p = { careLevel: 7, medical: { gastrostomy: true }, physical: { mobility: "bedridden" } };
    await resident.PATCH(req("staff-a", { profile: p }, "PATCH"), params({ id }));
    const link = await json(await surveyLink.POST(req("staff-a", {}), params({ id })));
    const token = link.body.url.split("/survey/")[1];
    const sv = await json(await survey.GET(req(null), params({ token })));
    expect(sv.body.questions.map((q: { id: string }) => q.id)).toContain("q6_emergency");
  });

  it("発行し直すと古いURLは使えない・期限切れは 410", async () => {
    const id = await newResident();
    const first = (await json(await surveyLink.POST(req("staff-a", {}), params({ id })))).body.url.split("/survey/")[1];
    const second = (await json(await surveyLink.POST(req("staff-a", {}), params({ id })))).body.url.split("/survey/")[1];
    expect((await survey.GET(req(null), params({ token: first }))).status).toBe(404);
    expect((await survey.GET(req(null), params({ token: second }))).status).toBe(200);

    for (const [k, v] of state.mem.store) {
      if (k.startsWith("surveyTokens/")) v.expiresAt = new Date(Date.now() - 1000).toISOString();
    }
    expect((await survey.GET(req(null), params({ token: second }))).status).toBe(410);
  });
});
