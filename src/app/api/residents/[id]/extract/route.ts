import { extractProfile, type SourceFile } from "@/lib/server/claude";
import { bucket } from "@/lib/server/firebaseAdmin";
import { handle, HttpError, requireStaff } from "@/lib/server/http";
import { getResident, updateResident } from "@/lib/server/repo";

export const maxDuration = 120;

const MAX_TOTAL = 25 * 1024 * 1024;

// アップロード済みの資料とスタッフの追記を Claude に読ませ、入居者の状態の下書きを作る。
// 結果は「未確認」として保存し、スタッフが画面で確認・修正してから判定に使う。
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]/extract">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  const resident = await getResident(staff.facilityId, id);

  const notes = [resident.staffNotes, resident.interviewNotes && `【面談メモ】\n${resident.interviewNotes}`]
    .filter(Boolean)
    .join("\n\n");
  if (resident.documents.length === 0 && !notes.trim()) {
    throw new HttpError(400, "資料をアップロードするか、病状などを追記してから読み取ってください");
  }

  const files: SourceFile[] = [];
  let total = 0;
  for (const d of resident.documents) {
    total += d.size;
    if (total > MAX_TOTAL) throw new HttpError(400, "資料の合計が25MBを超えています。不要な資料を削除してください");
    let data: Buffer;
    try {
      [data] = await bucket().file(d.path).download();
    } catch (e) {
      console.error("Storage download error", e);
      throw new HttpError(
        500,
        `資料「${d.name}」をサーバーで読み込めませんでした。Vercel の環境変数 FIREBASE_STORAGE_BUCKET がバケット名と一致しているか確認してください`,
      );
    }
    files.push({ name: d.name, contentType: d.contentType, data });
  }

  const result = await extractProfile(files, notes);
  const updated = await updateResident(staff.facilityId, id, {
    profile: result.profile,
    profileConfirmed: false,
    extraction: {
      at: new Date().toISOString(),
      model: result.model,
      uncertain: result.uncertain,
      evidence: result.evidence,
      profile: result.profile,
    },
  });
  return Response.json({ resident: updated });
});
