import { pickAnswers, surveyByIds, validateAnswers, type SurveyAnswers } from "@/lib/domain/survey";
import { handle, HttpError, readJson } from "@/lib/server/http";
import { findSurvey, submitSurvey } from "@/lib/server/repo";

// 家族向け（ログイン不要）。推測できないトークン付きURLと有効期限で守る。
// 返すのは設問と施設名だけで、入居者の状態や判定結果は返さない。

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/survey/[token]">) => {
  const { token } = await ctx.params;
  const s = await findSurvey(token);
  const survey = s.resident.survey!;
  return Response.json({
    facilityName: s.settings.facilityName || "施設",
    residentName: s.resident.name,
    submitted: Boolean(survey.submittedAt),
    expiresAt: survey.expiresAt,
    questions: surveyByIds(survey.questionIds),
  });
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/survey/[token]">) => {
  const { token } = await ctx.params;
  const s = await findSurvey(token);
  const questions = surveyByIds(s.resident.survey!.questionIds);
  const { answers } = await readJson<{ answers: SurveyAnswers }>(req);
  if (!answers || typeof answers !== "object") throw new HttpError(400, "回答が空です");
  const err = validateAnswers(questions, answers);
  if (err) throw new HttpError(400, err);
  await submitSurvey(s, pickAnswers(questions, answers));
  return Response.json({ ok: true });
});
