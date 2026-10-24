// Firestore に保存するレコードの形（API のレスポンスとしてクライアントにも渡す）
import type { SurveyAnswers } from "./survey";
import type { Evidence, FacilitySettings, Grade, JudgmentResult, ResidentProfile } from "./types";

export interface StoredDocument {
  path: string; // Storage のパス
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface SurveyState {
  issuedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  answers: SurveyAnswers | null;
  questionIds: string[];
  pastExperienceSummary: string | null;
}

export interface Resident {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profile: ResidentProfile | null;
  /** 施設スタッフが内容を確認・修正したか */
  profileConfirmed: boolean;
  extraction: {
    at: string;
    model: string;
    uncertain: string[];
    /** 項目ごとの根拠（古いデータには無い） */
    evidence?: Evidence[];
    /** AI が読み取った値（スタッフが直した項目を見分けるため。古いデータには無い） */
    profile?: ResidentProfile;
  } | null;
  staffNotes: string; // 病状・個人情報の追記
  interviewNotes: string; // 面談メモ
  priorFacilityNotes: string; // 前施設やケアマネからのトラブル情報
  documents: StoredDocument[];
  survey: SurveyState | null;
  latestJudgment: { id: string; grade: Grade; riskScore: number; at: string } | null;
}

export interface JudgmentRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  settingsVersion: number;
  result: JudgmentResult;
  pastExperienceSummary: string | null;
}

export interface SettingsRecord {
  settings: FacilitySettings;
  version: number;
  updatedAt: string | null;
}

export interface SettingsHistoryEntry {
  version: number;
  changedAt: string;
  changedBy: string;
  settings: FacilitySettings;
}
