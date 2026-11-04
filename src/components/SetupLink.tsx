"use client";
import { useState } from "react";
import { Button } from "./ui";

/** パスワード設定用のリンクを表示してコピーできるようにする（メールが届かないとき用） */
export function SetupLink({ email, link, onClose }: { email: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border-2 border-brand-soft bg-brand-tint p-4">
      <p className="text-[14px] font-bold">{email} さんのパスワード設定用リンク</p>
      <p className="mb-2 text-[13px] text-ink-soft">
        メールが届かないときは、このリンクを LINE やふだんのメールで本人に送ってください。開くとパスワードを設定できます。リンクは1時間ほどで使えなくなります。
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
    </div>
  );
}
