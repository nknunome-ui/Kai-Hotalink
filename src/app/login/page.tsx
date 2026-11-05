"use client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clientAuth, sendPasswordSetupEmail } from "@/lib/client/firebase";
import { Button, Field, Input, Logo, Notice, PasswordInput } from "@/components/ui";

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
        "auth/user-disabled": "このアカウントは停止されています。施設の管理者に確認してください",
        "auth/password-does-not-meet-requirements":
          "パスワードが Firebase のパスワード ポリシーの条件を満たしていません。「パスワードを忘れた方」から、条件に合うパスワードを設定し直してください",
      };
      const wrong = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
      setError(
        messages[code] ??
          (wrong.includes(code)
            ? "メールアドレスかパスワードが違います（アカウントが未作成の可能性もあります）"
            : `ログインできませんでした（${code || "原因不明"}）。この表示を施設の管理者か運営者に伝えてください`),
      );
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-sheet p-7 shadow-card sm:p-8">
        <h1>
          <Logo size="lg" />
        </h1>
        <p className="mt-2 mb-7 text-[15px] text-ink-soft">おつかれさまです。施設スタッフ用のログインです。</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="メールアドレス">
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="パスワード">
            <PasswordInput
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
        <ForgotPassword initialEmail={email} />
        <p className="mt-6 text-[12px] text-mute">アカウントは施設の管理者が発行します。</p>
      </div>
    </main>
  );
}

/** パスワードを忘れたときに、再設定のメールを送る */
function ForgotPassword({ initialEmail }: { initialEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "alert"; text: string } | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      // サーバーから HotaLink のメールを送る（未設定なら Firebase のメールで送る）
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error ?? ""), { code: res.status === 400 ? "auth/invalid-email" : "" });
      if (body.mailed === "client") await sendPasswordSetupEmail(email.trim());
      // アカウントがあるかどうかは伝えない（他人のメールアドレスの登録有無を調べられないように）
      setMsg({
        tone: "info",
        text: "登録されているメールアドレスなら、パスワード再設定のメールを送りました。届かない場合は迷惑メールフォルダもご確認ください。",
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setMsg({
        tone: "alert",
        text:
          code === "auth/invalid-email"
            ? "メールアドレスの形式が正しくありません"
            : code === "auth/too-many-requests"
              ? "送信が多すぎます。しばらく待ってからもう一度お試しください"
              : "メールを送れませんでした。時間をおいてもう一度お試しください",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="mt-4 text-[14px] font-bold text-brand-strong underline-offset-4 hover:underline"
        onClick={() => {
          setEmail(initialEmail);
          setOpen(true);
        }}
      >
        パスワードを忘れた方
      </button>
    );
  }
  return (
    <form onSubmit={send} className="mt-5 space-y-3 rounded-2xl bg-paper p-4">
      <p className="text-[14px] font-bold">パスワードの再設定</p>
      <p className="text-[13px] text-ink-soft">登録しているメールアドレスに、パスワード再設定のメールを送ります。</p>
      <Input type="email" required aria-label="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy} className="min-h-10">
          メールを送る
        </Button>
        <Button type="button" variant="quiet" className="min-h-10" onClick={() => setOpen(false)}>
          閉じる
        </Button>
      </div>
    </form>
  );
}
