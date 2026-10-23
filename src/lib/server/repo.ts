import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { defaultSettings } from "@/lib/domain/presets";
import type {
  JudgmentRecord,
  Resident,
  SettingsHistoryEntry,
  SettingsRecord,
  StoredDocument,
  SurveyState,
} from "@/lib/domain/records";
import type { SurveyAnswers } from "@/lib/domain/survey";
import type { FacilitySettings, JudgmentResult } from "@/lib/domain/types";
import { db } from "./firebaseAdmin";
import { HttpError, type Staff } from "./http";

// データは施設ごとに facilities/{facilityId} の下に分けて保存する。
// すべての読み書きはこのサーバー経由で行い、施設IDは認証トークンから取る。

const facility = (fid: string) => db().collection("facilities").doc(fid);
const residents = (fid: string) => facility(fid).collection("residents");
const now = () => new Date().toISOString();
const SURVEY_DAYS = 14;

type StoredResident = Omit<Resident, "id" | "survey"> & {
  survey: (SurveyState & { tokenHash: string }) | null;
};

function toResident(id: string, data: StoredResident): Resident {
  const { survey, ...rest } = data;
  let publicSurvey: SurveyState | null = null;
  if (survey) {
    const { tokenHash: _omit, ...s } = survey;
    void _omit;
    publicSurvey = s;
  }
  return { id, ...rest, survey: publicSurvey };
}

// ---------- 設定 ----------

export async function getSettings(fid: string): Promise<SettingsRecord> {
  const snap = await facility(fid).get();
  const data = snap.data();
  if (!data?.settings) return { settings: defaultSettings(), version: 0, updatedAt: null };
  return {
    settings: { ...defaultSettings(), ...data.settings, acceptance: { ...defaultSettings().acceptance, ...data.settings.acceptance } },
    version: data.settingsVersion ?? 0,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function saveSettings(staff: Staff, settings: FacilitySettings): Promise<SettingsRecord> {
  const ref = facility(staff.facilityId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const version = (snap.data()?.settingsVersion ?? 0) + 1;
    const at = now();
    tx.set(ref, { settings, settingsVersion: version, updatedAt: at }, { merge: true });
    const entry: SettingsHistoryEntry = {
      version,
      changedAt: at,
      changedBy: staff.email ?? staff.uid,
      settings,
    };
    tx.set(ref.collection("settingsHistory").doc(String(version).padStart(6, "0")), entry);
    return { settings, version, updatedAt: at };
  });
}

export async function settingsHistory(fid: string, limit = 20): Promise<SettingsHistoryEntry[]> {
  const snap = await facility(fid).collection("settingsHistory").orderBy("version", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as SettingsHistoryEntry);
}

// ---------- 入居者 ----------

export async function listResidents(fid: string): Promise<Resident[]> {
  const snap = await residents(fid).orderBy("updatedAt", "desc").limit(200).get();
  return snap.docs.map((d) => toResident(d.id, d.data() as StoredResident));
}

export async function createResident(fid: string, name: string): Promise<Resident> {
  const at = now();
  const data: StoredResident = {
    name,
    createdAt: at,
    updatedAt: at,
    profile: null,
    profileConfirmed: false,
    extraction: null,
    staffNotes: "",
    interviewNotes: "",
    priorFacilityNotes: "",
    documents: [],
    survey: null,
    latestJudgment: null,
  };
  const ref = await residents(fid).add(data);
  return toResident(ref.id, data);
}

async function getStored(fid: string, rid: string): Promise<StoredResident> {
  if (!/^[A-Za-z0-9]{1,64}$/.test(rid)) throw new HttpError(404, "入居者が見つかりません");
  const snap = await residents(fid).doc(rid).get();
  if (!snap.exists) throw new HttpError(404, "入居者が見つかりません");
  return snap.data() as StoredResident;
}

export async function getResident(fid: string, rid: string): Promise<Resident> {
  return toResident(rid, await getStored(fid, rid));
}

type ResidentPatch = Partial<
  Pick<
    StoredResident,
    | "name"
    | "profile"
    | "profileConfirmed"
    | "extraction"
    | "staffNotes"
    | "interviewNotes"
    | "priorFacilityNotes"
    | "latestJudgment"
  >
>;

export async function updateResident(fid: string, rid: string, patch: ResidentPatch): Promise<Resident> {
  await getStored(fid, rid);
  await residents(fid).doc(rid).update({ ...patch, updatedAt: now() });
  return getResident(fid, rid);
}

export async function addDocument(fid: string, rid: string, doc: StoredDocument): Promise<Resident> {
  const ref = residents(fid).doc(rid);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "入居者が見つかりません");
    const docs = ((snap.data() as StoredResident).documents ?? []).filter((d) => d.path !== doc.path);
    if (docs.length >= 20) throw new HttpError(400, "資料は1人あたり20件までです");
    tx.update(ref, { documents: [...docs, doc], updatedAt: now() });
  });
  return getResident(fid, rid);
}

export async function removeDocument(fid: string, rid: string, path: string): Promise<Resident> {
  const stored = await getStored(fid, rid);
  await residents(fid)
    .doc(rid)
    .update({ documents: stored.documents.filter((d) => d.path !== path), updatedAt: now() });
  return getResident(fid, rid);
}

// ---------- 家族アンケート ----------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 推測できないトークンを発行する。DB にはハッシュだけを保存する。 */
export async function issueSurveyToken(fid: string, rid: string, questionIds: string[]): Promise<string> {
  const stored = await getStored(fid, rid);
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SURVEY_DAYS * 24 * 3600 * 1000);
  const batch = db().batch();
  if (stored.survey?.tokenHash) batch.delete(db().collection("surveyTokens").doc(stored.survey.tokenHash));
  batch.set(db().collection("surveyTokens").doc(tokenHash), {
    facilityId: fid,
    residentId: rid,
    expiresAt: expiresAt.toISOString(),
  });
  const survey: StoredResident["survey"] = {
    tokenHash,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    submittedAt: null,
    answers: null,
    questionIds,
    pastExperienceSummary: null,
  };
  batch.update(residents(fid).doc(rid), { survey, updatedAt: now() });
  await batch.commit();
  return token;
}

export interface SurveyContext {
  facilityId: string;
  residentId: string;
  resident: StoredResident;
  settings: FacilitySettings;
}

export async function findSurvey(token: string): Promise<SurveyContext> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, "このURLは無効です");
  const tokenHash = hashToken(token);
  const snap = await db().collection("surveyTokens").doc(tokenHash).get();
  const t = snap.data();
  if (!t) throw new HttpError(404, "このURLは無効です。施設にお問い合わせください");
  if (new Date(t.expiresAt) < new Date()) {
    throw new HttpError(410, "このURLの有効期限が切れました。施設にお問い合わせください");
  }
  const resident = await getStored(t.facilityId, t.residentId);
  if (resident.survey?.tokenHash !== tokenHash) throw new HttpError(404, "このURLは無効です");
  const { settings } = await getSettings(t.facilityId);
  return { facilityId: t.facilityId, residentId: t.residentId, resident, settings };
}

export async function submitSurvey(ctx: SurveyContext, answers: SurveyAnswers): Promise<void> {
  const ref = residents(ctx.facilityId).doc(ctx.residentId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const survey = (snap.data() as StoredResident).survey;
    if (!survey || survey.tokenHash !== ctx.resident.survey?.tokenHash) throw new HttpError(404, "このURLは無効です");
    if (survey.submittedAt) throw new HttpError(409, "このアンケートは回答済みです");
    tx.update(ref, {
      "survey.answers": answers,
      "survey.submittedAt": now(),
      "survey.pastExperienceSummary": null,
      updatedAt: now(),
    });
  });
}

export async function setPastExperienceSummary(fid: string, rid: string, summary: string) {
  await residents(fid).doc(rid).update({ "survey.pastExperienceSummary": summary });
}

// ---------- 判定 ----------

export async function saveJudgment(
  staff: Staff,
  rid: string,
  result: JudgmentResult,
  settingsVersion: number,
  pastExperienceSummary: string | null,
): Promise<JudgmentRecord> {
  const ref = residents(staff.facilityId).doc(rid).collection("judgments").doc();
  const record: JudgmentRecord = {
    id: ref.id,
    createdAt: now(),
    createdBy: staff.email ?? staff.uid,
    settingsVersion,
    result,
    pastExperienceSummary,
  };
  const batch = db().batch();
  batch.set(ref, record);
  batch.update(residents(staff.facilityId).doc(rid), {
    latestJudgment: { id: ref.id, grade: result.grade, riskScore: result.riskScore, at: record.createdAt },
    updatedAt: record.createdAt,
  });
  await batch.commit();
  return record;
}

export async function listJudgments(fid: string, rid: string, limit = 10): Promise<JudgmentRecord[]> {
  const snap = await residents(fid).doc(rid).collection("judgments").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as JudgmentRecord);
}

/** 設定変更の試算用: 状態が登録済みの入居者を返す */
export async function residentsForSimulation(
  fid: string,
  limit = 30,
): Promise<Array<StoredResident & { id: string }>> {
  const snap = await residents(fid).orderBy("updatedAt", "desc").limit(limit).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as StoredResident) }))
    .filter((r) => r.profile !== null);
}
