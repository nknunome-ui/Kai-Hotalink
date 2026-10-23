import { aiEnabled } from "@/lib/server/claude";
import { handle, requireStaff } from "@/lib/server/http";
import { getSettings } from "@/lib/server/repo";

export const GET = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  const { settings } = await getSettings(staff.facilityId);
  return Response.json({
    email: staff.email,
    role: staff.role,
    facilityId: staff.facilityId,
    facilityName: settings.facilityName,
    aiEnabled: aiEnabled(),
  });
});
