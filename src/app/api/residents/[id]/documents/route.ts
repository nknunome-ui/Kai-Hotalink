import { bucket } from "@/lib/server/firebaseAdmin";
import { handle, HttpError, readJson, requireStaff } from "@/lib/server/http";
import { addDocument, getResident, removeDocument } from "@/lib/server/repo";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];
const MAX_BYTES = 20 * 1024 * 1024;

// ブラウザが Storage に直接アップロードしたあと、そのファイルを入居者に登録する。
// パスが自施設・この入居者の下にあるか、実在するかをサーバーで確認する。
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]/documents">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  await getResident(staff.facilityId, id);
  const { path, name } = await readJson<{ path?: string; name?: string }>(req);
  const prefix = `facilities/${staff.facilityId}/residents/${id}/`;
  if (!path || !path.startsWith(prefix) || path.includes("..")) throw new HttpError(400, "ファイルの場所が正しくありません");

  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpError(400, "ファイルが見つかりません。もう一度アップロードしてください");
  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  const contentType = String(meta.contentType ?? "");
  if (!ALLOWED_TYPES.includes(contentType) || size > MAX_BYTES) {
    await file.delete({ ignoreNotFound: true });
    throw new HttpError(400, "PDF・画像・テキストの20MB以下のファイルのみ登録できます");
  }

  const resident = await addDocument(staff.facilityId, id, {
    path,
    name: String(name ?? path.split("/").pop()).slice(0, 200),
    contentType,
    size,
    uploadedAt: new Date().toISOString(),
  });
  return Response.json({ resident });
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]/documents">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const resident = await getResident(staff.facilityId, id);
  if (!resident.documents.some((d) => d.path === path)) throw new HttpError(404, "資料が見つかりません");
  await bucket().file(path).delete({ ignoreNotFound: true });
  return Response.json({ resident: await removeDocument(staff.facilityId, id, path) });
});
