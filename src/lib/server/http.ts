import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { adminAuth } from "./firebaseAdmin";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Staff {
  uid: string;
  email: string | null;
  facilityId: string;
  role: "admin" | "staff";
}

/**
 * Authorization: Bearer <Firebase ID トークン> を検証し、所属施設を返す。
 * 施設IDはカスタムクレーム（scripts/create-staff.mjs で設定）から取るので、
 * 利用者が自分で別の施設を名乗ることはできない。
 */
export async function requireStaff(req: Request): Promise<Staff> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "ログインが必要です");
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, "ログインの有効期限が切れました。もう一度ログインしてください");
  }
  const facilityId = decoded.facilityId;
  if (typeof facilityId !== "string" || !facilityId) {
    throw new HttpError(403, "このアカウントは施設に登録されていません");
  }
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    facilityId,
    role: decoded.role === "admin" ? "admin" : "staff",
  };
}

/** 運営者（施設を追加できる人）か。Vercel の環境変数 OPERATOR_EMAILS（カンマ区切り）で決める */
export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** ログインしているかだけを確かめる（施設に所属していなくてもよい） */
export async function verifyUser(req: Request): Promise<{ uid: string; email: string | null }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "ログインが必要です");
  try {
    const decoded = await adminAuth().verifyIdToken(token, true);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    throw new HttpError(401, "ログインの有効期限が切れました。もう一度ログインしてください");
  }
}

/** 運営者だけが使える API 用。施設に所属していなくてもよい */
export async function requireOperator(req: Request): Promise<{ uid: string; email: string }> {
  const user = await verifyUser(req);
  if (!isOperatorEmail(user.email)) throw new HttpError(403, "この操作は運営者のみ行えます");
  return { uid: user.uid, email: user.email! };
}

export function requireAdmin(staff: Staff) {
  if (staff.role !== "admin") throw new HttpError(403, "この操作は施設の管理者のみ行えます");
}

/** ルートハンドラの共通エラーハンドリング */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      // API はすべてリクエストごとに実行する（ビルド時に事前生成しない）
      await connection();
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof HttpError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      console.error(e);
      return Response.json({ error: "サーバーでエラーが起きました" }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "リクエストの形式が正しくありません");
  }
}
