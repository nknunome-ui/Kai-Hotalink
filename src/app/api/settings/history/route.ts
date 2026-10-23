import { handle, requireStaff } from "@/lib/server/http";
import { settingsHistory } from "@/lib/server/repo";

export const GET = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  return Response.json({ history: await settingsHistory(staff.facilityId) });
});
