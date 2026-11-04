import { createFacility, listFacilities, normalizeEmail } from "@/lib/server/accounts";
import { handle, HttpError, readJson, requireOperator } from "@/lib/server/http";

// 運営者向け: 施設の一覧と追加（追加すると最初の管理者を招待する）
export const GET = handle(async (req: Request) => {
  await requireOperator(req);
  return Response.json({ facilities: await listFacilities() });
});

export const POST = handle(async (req: Request) => {
  const op = await requireOperator(req);
  const body = await readJson<{ name?: unknown; adminEmail?: unknown }>(req);
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 100) throw new HttpError(400, "施設名を100文字以内で入力してください");
  const adminEmail = normalizeEmail(body.adminEmail);
  const result = await createFacility(name, adminEmail, op.email);
  return Response.json({ facilityId: result.id, adminEmail, adminUid: result.admin.uid, created: result.admin.created });
});
