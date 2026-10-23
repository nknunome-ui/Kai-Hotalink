import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { MemoryDb } from "./memoryDb";

// サーバー側の Firebase Admin。
// 本番: サービスアカウントの3つの環境変数で認証する。
// ローカル: FIRESTORE_EMULATOR_HOST などが設定されていればエミュレータに接続する。
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

  if (usingEmulator) {
    return initializeApp({ projectId, storageBucket });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin の環境変数（FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY）が設定されていません",
    );
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
}

export const adminAuth = () => getAuth(app());

// 開発用: HOTALINK_MEMORY_DB=1 なら Firestore の代わりにメモリ上の DB を使う（本番では無効）
const useMemoryDb = process.env.HOTALINK_MEMORY_DB === "1" && process.env.NODE_ENV !== "production";
const g = globalThis as unknown as { __hotalinkMemDb?: MemoryDb };

export const db = (): Firestore =>
  useMemoryDb ? ((g.__hotalinkMemDb ??= new MemoryDb()) as unknown as Firestore) : getFirestore(app());
export const bucket = () => getStorage(app()).bucket();
