"use client";
import { confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Button, Field, Logo, Notice, PasswordInput } from "@/components/ui";
import { clientAuth } from "@/lib/client/firebase";

// パスワード設定（招待・パスワードを忘れたとき）のページ。
// 招待メールや「リンクを作る」のリンクはここに来る。パスワードを設定したら、そのままログインする。
// Firebase コンソールの「アクション URL」をこのページ（https://<ドメイン>/auth/action）にしておく。
export default function AuthActionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl bg-sheet p-7 shadow-card sm:p-8">
        <Logo size="lg" />
        <Suspense fallback={<p className="mt-6 text-mute">読み込み中…</p>}>
          <ResetPassword />
        </Suspense>
      </div>
    </main>
  );
}

type State = { step: "checking" } | { step: "invalid"; message: string } | { step: "form"; email: string };

function ResetPassword() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode");
  const code = params.get("oobCode") ?? "";
  const badLink = mode !== "resetPassword" || !code;
  const [checked, setState] = useState<State>({ step: "checking" });
  const state: State = badLink
    ? { step: "invalid", message: "このリンクは使えません。届いたメールのリンクを、もう一度開き直してください。" }
    : checked;
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (badLink) return;
    verifyPasswordResetCode(clientAuth(), code)
      .then((email) => setState({ step: "form", email }))
      .catch(() =>
        setState({
          step: "invalid",
          message:
            "このリンクは期限が切れているか、すでに使われています。施設の管理者に、パスワード設定のメールかリンクを送り直してもらってください。",
        }),
      );
  }, [badLink, code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state.step !== "form") return;
    setError(null);
    if (password.length < 8) return setError("パスワードは8文字以上にしてください");
    if (password !== again) return setError("確認のために入れたパスワードが一致しません");
    setBusy(true);
    try {
      await confirmPasswordReset(clientAuth(), code, password);
    } catch (err) {
      const c = (err as { code?: string }).code ?? "";
      setError(
        c === "auth/weak-password" || c === "auth/password-does-not-meet-requirements"
          ? "このパスワードは使えません。英字と数字を混ぜるなど、もう少し複雑なパスワードにしてください"
          : c === "auth/expired-action-code" || c === "auth/invalid-action-code"
            ? "このリンクは期限が切れています。施設の管理者に送り直してもらってください"
            : "パスワードを設定できませんでした。時間をおいてもう一度お試しください",
      );
      setBusy(false);
      return;
    }
    // 設定できたら、そのままログインする
    try {
      await signInWithEmailAndPassword(clientAuth(), state.email, password);
      router.replace("/residents");
    } catch {
      router.replace("/login");
    }
  }

  if (state.step === "checking") return <p className="mt-6 text-mute">リンクを確認しています…</p>;
  if (state.step === "invalid") {
    return (
      <div className="mt-6 space-y-4">
        <Notice tone="alert">{state.message}</Notice>
        <Button variant="quiet" className="w-full" onClick={() => router.replace("/login")}>
          ログイン画面へ
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold">パスワードの設定</h1>
        <p className="text-[14px] text-ink-soft">
          <b className="text-ink">{state.email}</b> のパスワードを決めてください。設定すると、そのままログインします。
        </p>
      </div>
      <Field label="新しいパスワード" hint="8文字以上">
        <PasswordInput autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="確認のため、もう一度">
        <PasswordInput autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
      </Field>
      {/* パスワード管理ソフトが、どのアカウントのパスワードか分かるように */}
      <input type="email" autoComplete="username" value={state.email} readOnly hidden />
      {error && <Notice tone="alert">{error}</Notice>}
      <Button type="submit" busy={busy} className="w-full">
        設定してログイン
      </Button>
    </form>
  );
}
