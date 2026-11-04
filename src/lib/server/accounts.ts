import "server-only";
import { randomBytes } from "node:crypto";
import { defaultSettings } from "@/lib/domain/presets";
import { adminAuth, db } from "./firebaseAdmin";
import { HttpError } from "./http";

// アカウント（Firebase Authentication のユーザー）と施設の管理。
// 所属施設と権限はカスタムクレーム（facilityId / role）に持つ。

export type Role = "admin" | "staff";

export interface StaffAccount {
  uid: string;
  email: string;
  role: Role;
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v: unknown): string {
  const email = String(v ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw new HttpError(400, "メールアドレスの形式が正しくありません");
  return email;
}

export function normalizeRole(v: unknown): Role {
  if (v !== "admin" && v !== "staff") throw new HttpError(400, "権限は「管理者」か「スタッフ」を選んでください");
  return v;
}

const toIso = (v: string | undefined) => (v ? new Date(v).toISOString() : null);

/** 施設に所属するスタッフの一覧（全ユーザーからカスタムクレームで絞る） */
export async function listStaff(fid: string): Promise<StaffAccount[]> {
  const out: StaffAccount[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.customClaims?.facilityId !== fid) continue;
      out.push({
        uid: u.uid,
        email: u.email ?? "",
        role: u.customClaims?.role === "admin" ? "admin" : "staff",
        disabled: u.disabled,
        createdAt: toIso(u.metadata.creationTime),
        lastSignInAt: toIso(u.metadata.lastSignInTime),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * スタッフを招待する。アカウントが無ければ作り（パスワードは推測できない一時的なもの）、
 * 所属施設と権限を設定する。パスワード設定のメールは画面側で送る。
 */
export async function inviteStaff(fid: string, email: string, role: Role): Promise<{ uid: string; created: boolean }> {
  const auth = adminAuth();
  let uid: string;
  let created = false;
  try {
    const u = await auth.getUserByEmail(email);
    const other = u.customClaims?.facilityId;
    if (other && other !== fid) throw new HttpError(409, "このメールアドレスは、ほかの施設のアカウントとして使われています");
    uid = u.uid;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const u = await auth.createUser({ email, password: randomBytes(24).toString("base64url") });
    uid = u.uid;
    created = true;
  }
  await auth.setCustomUserClaims(uid, { facilityId: fid, role });
  return { uid, created };
}

/** 権限の変更・アカウントの停止と再開。ほかの施設のアカウントは触れない */
export async function updateStaff(
  fid: string,
  actingUid: string,
  uid: string,
  patch: { role?: Role; disabled?: boolean },
): Promise<void> {
  const auth = adminAuth();
  const u = await auth.getUser(uid).catch(() => null);
  if (!u || u.customClaims?.facilityId !== fid) throw new HttpError(404, "スタッフが見つかりません");
  if (uid === actingUid && (patch.role === "staff" || patch.disabled === true)) {
    throw new HttpError(400, "自分自身の権限を下げたり、停止したりすることはできません（ほかの管理者に頼んでください）");
  }
  if (patch.role) await auth.setCustomUserClaims(uid, { ...u.customClaims, facilityId: fid, role: patch.role });
  if (patch.disabled !== undefined) {
    await auth.updateUser(uid, { disabled: patch.disabled });
    // 停止したら、ログイン中の端末からもすぐに使えなくする
    if (patch.disabled) await auth.revokeRefreshTokens(uid);
  }
}

// ---------- 施設（運営者向け） ----------

export interface FacilitySummary {
  id: string;
  name: string;
  createdAt: string | null;
  createdBy: string | null;
  /** 施設の管理者 */
  admins: { uid: string; email: string; disabled: boolean; lastSignInAt: string | null }[];
}

/** 施設の一覧と、それぞれの管理者 */
export async function listFacilities(): Promise<FacilitySummary[]> {
  const admins = new Map<string, FacilitySummary["admins"]>();
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const fid = u.customClaims?.facilityId;
      if (typeof fid !== "string" || u.customClaims?.role !== "admin") continue;
      const list = admins.get(fid) ?? [];
      list.push({ uid: u.uid, email: u.email ?? "", disabled: u.disabled, lastSignInAt: toIso(u.metadata.lastSignInTime) });
      admins.set(fid, list);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const snap = await db().collection("facilities").get();
  return snap.docs
    .map((d) => {
      const data = d.data() as { settings?: { facilityName?: string }; createdAt?: string; createdBy?: string };
      return {
        id: d.id,
        name: data.settings?.facilityName ?? "",
        createdAt: data.createdAt ?? null,
        createdBy: data.createdBy ?? null,
        admins: (admins.get(d.id) ?? []).sort((x, y) => x.email.localeCompare(y.email)),
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** 施設を作り、最初の管理者を招待する。施設 ID は推測しにくいものを自動で付ける */
export async function createFacility(name: string, adminEmail: string, operatorEmail: string) {
  // 管理者を招待できないとわかっているなら、施設を作る前に止める（管理者のいない施設を残さない）
  const existing = await adminAuth().getUserByEmail(adminEmail).catch(() => null);
  if (existing?.customClaims?.facilityId) {
    throw new HttpError(409, "このメールアドレスは、ほかの施設のアカウントとして使われています");
  }
  const id = `f-${randomBytes(5).toString("hex")}`;
  const at = new Date().toISOString();
  await db()
    .collection("facilities")
    .doc(id)
    .set({ settings: defaultSettings(name), settingsVersion: 0, createdAt: at, createdBy: operatorEmail });
  const admin = await inviteStaff(id, adminEmail, "admin");
  return { id, admin };
}

/** 既存の施設に管理者を追加する（運営者向け） */
export async function addFacilityAdmin(fid: string, email: string) {
  const snap = await db().collection("facilities").doc(fid).get();
  if (!snap.exists) throw new HttpError(404, "施設が見つかりません");
  return inviteStaff(fid, email, "admin");
}

/**
 * パスワード設定用のリンクを作る（メールが届かないとき、LINE などで本人に送ってもらう）。
 * 新しいリンクを作ると、それより前のリンク（メールで送ったものも）は使えなくなる。
 * Firebase のページではなく、このアプリのパスワード設定ページ（/auth/action）を開くリンクにする。
 */
export async function passwordSetupLink(email: string, origin: string): Promise<string> {
  const firebaseLink = await adminAuth().generatePasswordResetLink(email);
  const code = new URL(firebaseLink).searchParams.get("oobCode");
  if (!code) throw new HttpError(500, "パスワード設定用のリンクを作れませんでした");
  return `${origin}/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(code)}`;
}

/** 施設の管理者・スタッフ本人のリンクだけを作れるようにする */
export async function setupLinkForMember(fid: string, uid: string, origin: string): Promise<{ email: string; link: string }> {
  const u = await adminAuth().getUser(uid).catch(() => null);
  if (!u || u.customClaims?.facilityId !== fid || !u.email) throw new HttpError(404, "スタッフが見つかりません");
  return { email: u.email, link: await passwordSetupLink(u.email, origin) };
}
