import { handle, HttpError, readJson, requireStaff } from "@/lib/server/http";
import { createResident, listResidents } from "@/lib/server/repo";

export const GET = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  return Response.json({ residents: await listResidents(staff.facilityId) });
});

export const POST = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  const { name } = await readJson<{ name?: string }>(req);
  const trimmed = (name ?? "").trim();
  if (!trimmed || trimmed.length > 50) throw new HttpError(400, "お名前を50文字以内で入力してください");
  return Response.json({ resident: await createResident(staff.facilityId, trimmed) }, { status: 201 });
});
