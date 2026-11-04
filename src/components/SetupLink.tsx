"use client";
import { useState } from "react";
import { Button } from "./ui";

/**
 * メールが届かないときに、パスワード設定用のリンクを作って表示する。
 * 新しいリンクを作ると、それより前にメールで送ったリンクは使えなくなるので、押したときだけ作る。
 */
export function SetupLink({ email, create, onClose }: { email: string; create: () => Promise<string>; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      setLink(await create());
    } catch (e) {
      setError(e instanceof Error ? e.message : "リンクを作れませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-brand-soft bg-brand-tint p-4">
      <p className="text-[14px] font-bold">{email} さんにメールが届かないとき</p>
      {!link ? (
        <>
          <p className="mb-2 text-[13px] text-ink-soft">
            パスワード設定用のリンクを作り、LINE やふだんのメールで本人に送れます。リンクを作ると、
            <b>それまでにメールで送ったリンクは使えなくなります</b>。
          </p>
          {error && <p className="mb-2 text-[13px] text-alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" className="min-h-9 text-[13px]" busy={busy} onClick={make}>
              リンクを作る
            </Button>
            <Button variant="quiet" className="min-h-9 text-[13px]" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ink-soft">
            このリンクを本人に送ってください。開くとパスワードを設定できます。リンクは1時間ほどで使えなくなります。メールで届いたリンクは、もう使えません。
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={link}
              aria-label="パスワード設定用リンク"
              className="min-w-0 flex-1 rounded-xl border-2 border-line bg-sheet px-3 py-1.5 text-[13px]"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="quiet"
              className="min-h-9 text-[13px]"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? "コピーしました" : "リンクをコピー"}
            </Button>
            <Button variant="quiet" className="min-h-9 text-[13px]" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
