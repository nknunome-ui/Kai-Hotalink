"use client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clientAuth } from "@/lib/client/firebase";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(clientAuth(), email.trim(), password);
      router.replace("/residents");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      const messages: Record<string, string> = {
        "auth/operation-not-allowed":
          "Firebase でメール/パスワードのログインが有効になっていません（Authentication → ログイン方法）",
        "auth/too-many-requests": "ログインの試行が多すぎます。しばらく待ってからもう一度お試しください",
        "auth/network-request-failed": "通信できませんでした。ネットワークを確認してください",
        "auth/invalid-api-key": ".env.local の NEXT_PUBLIC_FIREBASE_API_KEY が正しくありません",
      };
      setError(messages[code] ?? "メールアドレスかパスワードが違います（アカウントが未作成の可能性もあります）");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-mincho text-[34px] tracking-wide text-indigo">Hotalink</h1>
        <p className="mb-8 text-[14px] text-ink-soft">施設スタッフ用のログイン</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="メールアドレス">
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="パスワード">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <Notice tone="alert">{error}</Notice>}
          <Button type="submit" busy={busy} className="w-full">
            ログイン
          </Button>
        </form>
        <p className="mt-6 text-[12px] text-mute">アカウントは施設の管理者が発行します。</p>
      </div>
    </main>
  );
}
