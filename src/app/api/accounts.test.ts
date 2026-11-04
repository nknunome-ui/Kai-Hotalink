// スタッフ管理・施設の追加の API テスト。Firebase の認証は、メモリ上の偽物で置き換える。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/server/memoryDb";

interface FakeUser {
  uid: string;
  email: string;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
  metadata: { creationTime?: string; lastSignInTime?: string };
}

const state = vi.hoisted(() => ({
  mem: null as unknown as MemoryDb,
  users: new Map<string, FakeUser>(),
  revoked: [] as string[],
  seq: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const byEmail = (email: string) => [...state.users.values()].find((u) => u.email === email);
  return {
    db: () => state.mem,
    adminAuth: () => ({
      // トークンは「uid」をそのまま使う
      verifyIdToken: async (token: string) => {
        const u = state.users.get(token);
        if (!u || u.disabled) throw new Error("invalid");
        return { uid: u.uid, email: u.email, ...u.customClaims };
      },
      listUsers: async () => ({ users: [...state.users.values()], pageToken: undefined }),
      getUser: async (uid: string) => {
        const u = state.users.get(uid);
        if (!u) throw new Error("not found");
        return u;
      },
      getUserByEmail: async (email: string) => {
        const u = byEmail(email);
        if (!u) throw new Error("not found");
        return u;
      },
      createUser: async ({ email }: { email: string }) => {
        const u: FakeUser = { uid: `new${++state.seq}`, email, disabled: false, metadata: { creationTime: new Date().toUTCString() } };
        state.users.set(u.uid, u);
        return u;
      },
      setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
        state.users.get(uid)!.customClaims = claims;
      },
      updateUser: async (uid: string, patch: Partial<FakeUser>) => Object.assign(state.users.get(uid)!, patch),
      revokeRefreshTokens: async (uid: string) => void state.revoked.push(uid),
      generatePasswordResetLink: async (email: string, settings?: { url: string }) =>
        `https://example.firebaseapp.com/__/auth/action?mode=resetPassword&email=${email}&continue=${settings?.url ?? ""}`,
    }),
  };
});

const staffRoute = await import("./staff/route");
const staffOne = await import("./staff/[uid]/route");
const facilities = await import("./operator/facilities/route");
const facilityAdmins = await import("./operator/facilities/[id]/admins/route");
const staffLink = await import("./staff/[uid]/setup-link/route");
const adminLink = await import("./operator/facilities/[id]/admins/[uid]/setup-link/route");
const me = await import("./me/route");

const req = (token: string | null, body?: unknown, method = body ? "POST" : "GET") =>
  new Request("http://localhost/api", {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) }) as never;
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

const user = (uid: string, email: string, claims?: Record<string, unknown>) =>
  state.users.set(uid, { uid, email, disabled: false, customClaims: claims, metadata: {} });

beforeEach(() => {
  state.mem = new MemoryDb();
  state.users.clear();
  state.revoked = [];
  user("adminA", "admin@a.jp", { facilityId: "fa", role: "admin" });
  user("staffA", "staff@a.jp", { facilityId: "fa", role: "staff" });
  user("staffB", "staff@b.jp", { facilityId: "fb", role: "staff" });
  process.env.OPERATOR_EMAILS = " Op@Example.jp , other@example.jp";
  // 運営者は施設に所属していなくてもよい
  user("op", "op@example.jp");
});

describe("スタッフ管理（施設の管理者）", () => {
  it("一覧は自分の施設のスタッフだけ。スタッフ権限では使えない", async () => {
    const r = await json(await staffRoute.GET(req("adminA")));
    expect(r.body.staff.map((s: { email: string }) => s.email)).toEqual(["admin@a.jp", "staff@a.jp"]);
    expect((await staffRoute.GET(req("staffA"))).status).toBe(403);
  });

  it("招待: 新しいアカウントを作って施設と権限を付ける。ほかの施設のアカウントは取らない", async () => {
    const r = await json(await staffRoute.POST(req("adminA", { email: " New@A.jp ", role: "staff" })));
    expect(r.body).toMatchObject({ email: "new@a.jp", created: true });
    expect(state.users.get(r.body.uid)!.customClaims).toEqual({ facilityId: "fa", role: "staff" });
    // 招待ではリンクを作らない（作るとメールのリンクが使えなくなるため）
    expect(r.body.link).toBeUndefined();

    const taken = await json(await staffRoute.POST(req("adminA", { email: "staff@b.jp", role: "staff" })));
    expect(taken.status).toBe(409);
    expect((await staffRoute.POST(req("adminA", { email: "not-an-email", role: "staff" }))).status).toBe(400);
    expect((await staffRoute.POST(req("adminA", { email: "x@a.jp", role: "owner" }))).status).toBe(400);
  });

  it("権限の変更と停止。自分は下げられず、ほかの施設のスタッフは触れない", async () => {
    expect((await staffOne.PATCH(req("adminA", { role: "admin" }, "PATCH"), params({ uid: "staffA" }))).status).toBe(200);
    expect(state.users.get("staffA")!.customClaims!.role).toBe("admin");

    expect((await staffOne.PATCH(req("adminA", { disabled: true }, "PATCH"), params({ uid: "staffA" }))).status).toBe(200);
    expect(state.users.get("staffA")!.disabled).toBe(true);
    expect(state.revoked).toContain("staffA");

    expect((await staffOne.PATCH(req("adminA", { role: "staff" }, "PATCH"), params({ uid: "adminA" }))).status).toBe(400);
    expect((await staffOne.PATCH(req("adminA", { disabled: true }, "PATCH"), params({ uid: "staffB" }))).status).toBe(404);
  });
});

describe("施設の追加（運営者）", () => {
  it("OPERATOR_EMAILS に入っている人だけが使え、/api/me にも運営者かどうかを返す", async () => {
    expect((await facilities.GET(req("adminA"))).status).toBe(403);
    expect((await json(await me.GET(req("op")))).body).toMatchObject({ operator: true, facilityId: "" });
    expect((await json(await me.GET(req("adminA")))).body.operator).toBe(false);
  });

  it("施設を作り、最初の管理者を招待する。ほかの施設のアカウントなら施設を作らない", async () => {
    const r = await json(await facilities.POST(req("op", { name: "さくらの家", adminEmail: "boss@sakura.jp" })));
    expect(r.status).toBe(200);
    expect(r.body.facilityId).toMatch(/^f-[0-9a-f]{10}$/);
    const admin = [...state.users.values()].find((u) => u.email === "boss@sakura.jp")!;
    expect(admin.customClaims).toEqual({ facilityId: r.body.facilityId, role: "admin" });

    const list = await json(await facilities.GET(req("op")));
    expect(list.body.facilities).toContainEqual(expect.objectContaining({ id: r.body.facilityId, name: "さくらの家", createdBy: "op@example.jp" }));

    const before = (await json(await facilities.GET(req("op")))).body.facilities.length;
    expect((await facilities.POST(req("op", { name: "別の家", adminEmail: "staff@b.jp" }))).status).toBe(409);
    expect((await json(await facilities.GET(req("op")))).body.facilities.length).toBe(before);
  });

  it("施設の一覧に管理者を出し、既存の施設に管理者を追加できる。無い施設には追加しない", async () => {
    state.mem.collection("facilities").doc("fa").setSync({ settings: { facilityName: "ひだまりの家" } });
    const before = (await json(await facilities.GET(req("op")))).body.facilities.find((f: { id: string }) => f.id === "fa");
    expect(before.admins.map((a: { email: string }) => a.email)).toEqual(["admin@a.jp"]);

    const r = await json(await facilityAdmins.POST(req("op", { email: "boss2@a.jp" }), params({ id: "fa" })));
    expect(r.body).toMatchObject({ email: "boss2@a.jp", created: true });
    const after = (await json(await facilities.GET(req("op")))).body.facilities.find((f: { id: string }) => f.id === "fa");
    expect(after.admins.map((a: { email: string }) => a.email)).toEqual(["admin@a.jp", "boss2@a.jp"]);

    expect((await facilityAdmins.POST(req("op", { email: "x@x.jp" }), params({ id: "nope" }))).status).toBe(404);
    expect((await facilityAdmins.POST(req("adminA", { email: "x@x.jp" }), params({ id: "fa" }))).status).toBe(403);
  });

  it("パスワード設定用のリンクは、自分の施設のスタッフ（運営者は指定した施設の管理者）のぶんだけ作れる", async () => {
    const mine = await json(await staffLink.POST(req("adminA", {}), params({ uid: "staffA" })));
    expect(mine.body).toMatchObject({ email: "staff@a.jp" });
    expect(mine.body.link).toContain("email=staff@a.jp&continue=http://localhost/login");
    expect((await staffLink.POST(req("adminA", {}), params({ uid: "staffB" }))).status).toBe(404);
    expect((await staffLink.POST(req("staffA", {}), params({ uid: "staffA" }))).status).toBe(403);

    expect((await json(await adminLink.POST(req("op", {}), params({ id: "fa", uid: "adminA" })))).body.email).toBe("admin@a.jp");
    expect((await adminLink.POST(req("op", {}), params({ id: "fb", uid: "adminA" }))).status).toBe(404);
    expect((await adminLink.POST(req("adminA", {}), params({ id: "fa", uid: "adminA" }))).status).toBe(403);
  });
});
