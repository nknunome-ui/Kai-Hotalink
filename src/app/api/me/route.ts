import { aiEnabled } from "@/lib/server/claude";
import { handle, isOperatorEmail, requireStaff, verifyUser } from "@/lib/server/http";
import { getSettings } from "@/lib/server/repo";

export const GET = handle(async (req: Request) => {
  // 運営者は施設管理の画面だけを使う（施設に所属していなくてもよい）
  const user = await verifyUser(req);
  if (isOperatorEmail(user.email)) {
    return Response.json({
      email: user.email,
      role: "admin",
      facilityId: "",
      facilityName: "",
      contactDesk: "",
      contactPhone: "",
      aiEnabled: aiEnabled(),
      operator: true,
    });
  }
  const staff = await requireStaff(req);
  const { settings } = await getSettings(staff.facilityId);
  return Response.json({
    email: staff.email,
    role: staff.role,
    facilityId: staff.facilityId,
    facilityName: settings.facilityName,
    contactDesk: settings.contactDesk,
    contactPhone: settings.contactPhone,
    aiEnabled: aiEnabled(),
    operator: false,
  });
});
