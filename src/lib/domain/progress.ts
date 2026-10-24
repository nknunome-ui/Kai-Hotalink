// 入居者ごとの作業の進み具合と「次にやること」。一覧と詳細画面で同じ判断を使う。
import type { Resident } from "./records";

export type StepKey = "documents" | "profile" | "survey" | "judge";

export const STEP_LABELS: Record<StepKey, string> = {
  documents: "資料と追記",
  profile: "状態の確認",
  survey: "家族アンケート",
  judge: "入居判定",
};

export interface NextAction {
  step: StepKey;
  text: string;
  /** 施設側の操作ではなく、家族の回答などを待っている */
  waiting?: boolean;
}

export interface Progress {
  done: Record<StepKey, boolean>;
  /** 判定のあとに資料・状態・アンケートが変わった */
  stale: boolean;
  next: NextAction | null;
}

export function progressOf(r: Resident): Progress {
  const hasMaterial = r.documents.length > 0 || r.staffNotes.trim() !== "" || r.interviewNotes.trim() !== "";
  const confirmed = Boolean(r.profile && r.profileConfirmed);
  const answered = Boolean(r.survey?.submittedAt);
  const judged = Boolean(r.latestJudgment);
  // 最後の変更がアンケートURLの発行だけなら、判定の材料は変わっていない
  const onlyIssuedSurvey = Boolean(r.survey && !r.survey.submittedAt && r.survey.issuedAt === r.updatedAt);
  const stale = Boolean(r.latestJudgment && r.updatedAt > r.latestJudgment.at && !onlyIssuedSurvey);

  const done: Record<StepKey, boolean> = {
    documents: hasMaterial || Boolean(r.profile),
    profile: confirmed,
    survey: answered,
    judge: judged && !stale,
  };

  let next: NextAction | null = null;
  if (!r.profile && !hasMaterial) next = { step: "documents", text: "資料を登録するか、病状を追記する" };
  else if (!r.profile) next = { step: "documents", text: "AIで資料を読み取る" };
  else if (!confirmed) next = { step: "profile", text: "AIの読み取り結果を確認して保存する" };
  else if (!r.survey) next = { step: "survey", text: "家族アンケートのURLを送る" };
  else if (!judged) next = { step: "judge", text: answered ? "判定する" : "判定する（家族の回答は後から反映できます）" };
  else if (stale) next = { step: "judge", text: "情報が変わったので、もう一度判定する" };
  else if (!answered) next = { step: "survey", text: "家族の回答待ち", waiting: true };

  return { done, stale, next };
}
