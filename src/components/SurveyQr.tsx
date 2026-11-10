"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "./ui";

/** URL の QR コードを画像（data URL）にする */
export function useQrDataUrl(url: string, width = 640): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width, errorCorrectionLevel: "M" })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url, width]);
  return src;
}

/** アンケート URL の QR コード。面談の場で画面に出し、ご家族のスマホで読み取ってもらう。 */
export function SurveyQr({ url }: { url: string }) {
  const src = useQrDataUrl(url);
  const [large, setLarge] = useState(false);

  useEffect(() => {
    if (!large) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setLarge(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [large]);

  if (!src) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL の画像なので最適化は不要 */}
      <img src={src} alt="アンケートの QR コード" className="size-32 rounded-xl bg-white p-1" />
      <div className="space-y-2">
        <p className="text-[13px] text-ink-soft">ご家族のスマホのカメラで読み取ると、アンケートが開きます。</p>
        <Button variant="quiet" className="min-h-9 text-[13px]" onClick={() => setLarge(true)}>
          QR コードを大きく表示
        </Button>
      </div>
      {large && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="アンケートの QR コード"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-paper/95 p-6 backdrop-blur"
          onClick={() => setLarge(false)}
        >
          <p className="text-center text-[22px] font-bold text-brand-strong">スマホのカメラで読み取ってください</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL の画像なので最適化は不要 */}
          <img src={src} alt="アンケートの QR コード（大）" className="aspect-square w-[min(80vw,70vh)] rounded-3xl bg-white p-4 shadow-card" />
          <Button variant="quiet" onClick={() => setLarge(false)}>
            閉じる
          </Button>
        </div>
      )}
    </div>
  );
}
