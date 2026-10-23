// 施設スタッフのアカウントを作り、所属施設と権限を設定するスクリプト。
//
// 使い方:
//   node scripts/create-staff.mjs --email admin@example.com --password 'xxxxxxxx' \
//     --facility hidamari --role admin --facility-name "ひだまりの家"
//
// --facility は施設ID（英数字・ハイフン）。同じ施設のスタッフには同じIDを使う。
// --role は admin（設定を変更できる）か staff（判定まで行える）。
// .env.local の Firebase Admin の設定を読み込む。エミュレータの環境変数があればエミュレータに作る。

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    facility: { type: "string" },
    role: { type: "string", default: "staff" },
    "facility-name": { type: "string" },
  },
});

const { email, password, facility, role } = values;
if (!email || !facility) {
  console.error("--email と --facility は必須です");
  process.exit(1);
}
if (!/^[a-z0-9-]{2,40}$/.test(facility)) {
  console.error("--facility は英小文字・数字・ハイフンの2〜40文字にしてください");
  process.exit(1);
}
if (!["admin", "staff"].includes(role)) {
  console.error("--role は admin か staff にしてください");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const app = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? initializeApp({ projectId })
  : initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

const auth = getAuth(app);
let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`既存のアカウントを更新します: ${email}`);
  if (password) await auth.updateUser(user.uid, { password });
} catch {
  if (!password || password.length < 8) {
    console.error("新しいアカウントには8文字以上の --password が必要です");
    process.exit(1);
  }
  user = await auth.createUser({ email, password });
  console.log(`アカウントを作成しました: ${email}`);
}

await auth.setCustomUserClaims(user.uid, { facilityId: facility, role });
console.log(`所属施設: ${facility} / 権限: ${role}`);

if (values["facility-name"]) {
  // 施設名だけ設定する（そのほかの受け入れ設定は既定値。画面の「受け入れ設定」で変更する）
  const db = getFirestore(app);
  await db
    .collection("facilities")
    .doc(facility)
    .set({ settings: { facilityName: values["facility-name"] } }, { merge: true });
  console.log(`施設名: ${values["facility-name"]}`);
}

console.log("完了しました。すでにログイン中の場合は、一度ログアウトしてからログインし直してください。");
process.exit(0);
