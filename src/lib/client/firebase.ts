"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

function app() {
  if (getApps().length) return getApp();
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `.env.local の Firebase 設定が空です（${missing.join(", ")}）。値を入れて保存し、npm run dev を再起動してください。`,
    );
  }
  return initializeApp(config);
}

export function clientAuth(): Auth {
  if (!auth) {
    auth = getAuth(app());
    if (useEmulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

export function clientStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(app());
    // 既定では失敗しても最大10分再試行し、画面が「アップロード中」のまま止まって見えるため短くする
    storage.maxUploadRetryTime = 30_000;
    storage.maxOperationRetryTime = 30_000;
    if (useEmulators) connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  return storage;
}

/** Storage のエラーを、施設の担当者が対処できる日本語にする */
export function storageErrorMessage(e: unknown, fileName: string): string {
  const code = (e as { code?: string } | null)?.code ?? "";
  if (code === "storage/unauthorized") {
    return `${fileName}：アップロードが許可されませんでした。Storage のセキュリティルールが反映されていないか、このアカウントが施設に登録されていません。`;
  }
  if (code === "storage/retry-limit-exceeded" || code === "storage/unknown" || code === "storage/bucket-not-found") {
    return `${fileName}：ファイルの保存先（Firebase Storage）に接続できませんでした。Firebase コンソールで Storage が作成されているか、NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET が正しいか確認してください。`;
  }
  if (code === "storage/quota-exceeded") return `${fileName}：Storage の容量・利用枠を超えています。`;
  if (code === "storage/canceled") return `${fileName}：アップロードが中断されました。`;
  return e instanceof Error ? `${fileName}：${e.message}` : `${fileName}：アップロードできませんでした`;
}
