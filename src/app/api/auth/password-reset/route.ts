import { deliverReset, normalizeEmail } from "@/lib/server/accounts";
import { appOrigin, handle, readJson } from "@/lib/server/http";

// ログイン画面の「パスワードを忘れた方」（ログイン不要）。
// アカウントがあるかどうかは返さない。RESEND_API_KEY が未設定なら mailed: "client" を返し、画面側で Firebase のメールを送る。
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ email?: unknown }>(req);
  const email = normalizeEmail(body.email);
  return Response.json({ mailed: await deliverReset(email, appOrigin(req)) });
});
