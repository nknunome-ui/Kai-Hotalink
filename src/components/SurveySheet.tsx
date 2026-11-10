"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/client/auth";
import { useQrDataUrl } from "./SurveyQr";
import { Button, Field, Input } from "./ui";

// 家族アンケートの案内（紙）。QR コード入りの A4 1枚を、印刷するか PDF で保存して、ご家族に渡す。

const dateJa = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

interface SheetInfo {
  url: string;
  qr: string;
  residentName: string;
  expiresAt: string | null;
  facilityName: string;
  desk: string;
  phone: string;
  person: string;
}

/** 「案内を印刷・PDF保存」ボタンと、その画面 */
export function SurveySheetButton({ url, residentName, expiresAt }: { url: string; residentName: string; expiresAt: string | null }) {
  const { me } = useAuth();
  const qr = useQrDataUrl(url, 800);
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (!qr) return null;
  const info: SheetInfo = {
    url,
    qr,
    residentName,
    expiresAt,
    facilityName: me?.facilityName || "",
    desk: me?.contactDesk || "入居相談窓口",
    phone: me?.contactPhone || "",
    person: person.trim(),
  };

  return (
    <>
      <Button variant="quiet" className="min-h-9 text-[13px]" onClick={() => setOpen(true)}>
        案内を印刷・PDFで保存
      </Button>
      {open && (
        <>
          <div role="dialog" aria-modal="true" aria-label="アンケートの案内" className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm print:hidden">
            <div className="mx-auto max-w-[860px] rounded-3xl bg-paper p-5 shadow-card sm:p-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-bold">アンケートの案内（A4）</h2>
                  <p className="text-[13px] text-ink-soft">
                    印刷してご家族に渡すか、「PDFに保存」を選んでメールなどで送ってください。
                    {!me?.contactPhone && " 窓口の電話番号は、受け入れ設定で入れられます。"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <Field label="担当者（空欄なら載せません）">
                  <Input value={person} maxLength={30} onChange={(e) => setPerson(e.target.value)} placeholder="例：山田" />
                </Field>
                <Button onClick={() => window.print()}>印刷・PDFに保存</Button>
                <Button variant="quiet" onClick={() => setOpen(false)}>
                  閉じる
                </Button>
              </div>
              <p className="mt-2 text-[12px] text-mute">
                PDFにするときは、印刷の画面で送信先（プリンター）を「PDFに保存」にします。
              </p>
              {/* 画面での見本。紙と同じ比率で縮めて見せる */}
              <div className="mt-4 overflow-x-auto rounded-2xl bg-line/60 p-3 sm:p-5">
                <div className="mx-auto w-[210mm] bg-white shadow-card max-sm:[zoom:0.45] sm:max-md:[zoom:0.7] md:[zoom:0.85]">
                  <Sheet {...info} />
                </div>
              </div>
            </div>
          </div>
          {/* 印刷するのはこちら（画面には出さない） */}
          {createPortal(
            <div className="survey-print hidden print:block">
              <Sheet {...info} />
            </div>,
            document.body,
          )}
        </>
      )}
    </>
  );
}

function Sheet({ url, qr, residentName, expiresAt, facilityName, desk, phone, person }: SheetInfo) {
  const facility = facilityName || "当施設";
  return (
    <article className="flex min-h-[287mm] flex-col px-[20mm] pt-[16mm] pb-[12mm] text-[10.5pt] leading-[1.85] text-[#3b302a]">
      <header className="flex items-end justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- 印刷用。next/image の遅延読み込みで印刷に間に合わないことがあるため */}
        <img src="/logo.png" alt="HotaLink" className="h-[13mm] w-auto" />
        {residentName && <p className="text-[10pt] text-[#7a6a60]">{residentName} 様 ご家族様</p>}
      </header>

      <h1 className="mt-[9mm] border-b-[1.2mm] border-[#fbd7b5] pb-[2mm] text-center text-[17pt] font-bold tracking-wider">
        ご入居に向けた事前ヒアリングシート
      </h1>

      <div className="mt-[7mm] space-y-[3mm]">
        <p>{facility}の入居をご検討いただき、ありがとうございます。</p>
        <p>当施設では、ご本人様への適切なケアはもちろんのこと、ご家族様の「想い」や「お考え」に寄り添ったサポートを何よりも大切にしています。</p>
        <p>
          ご入居後に「施設とご家族がひとつのチーム」として安心のケアを提供できるよう、現在のお体の状態や、介護に対するご家族様のお考えについて、簡単なアンケートへのご協力をお願いいたします。
        </p>
      </div>

      <section className="mt-[8mm] rounded-[5mm] border-[0.6mm] border-[#f4a259] px-[8mm] py-[6mm]">
        <h2 className="text-[12pt] font-bold text-[#c2550f]">【回答方法】</h2>
        <div className="mt-[3mm] flex items-center gap-[8mm]">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL の画像 */}
          <img src={qr} alt="アンケートの QR コード" className="size-[42mm] shrink-0" />
          <div className="min-w-0 space-y-[2mm]">
            <p>お手持ちのスマートフォンやタブレットのカメラで、左のQRコードを読み取り、専用フォームよりご回答をお願いいたします。</p>
            <p>
              所要時間：約10分程度
              {expiresAt && (
                <>
                  <br />
                  回答期限：{dateJa(expiresAt)}まで
                </>
              )}
            </p>
            <p className="text-[8pt] leading-snug break-all text-[#7a6a60]">
              読み取れない場合は、次のアドレスを入力してください。
              <br />
              {url}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-[7mm] space-y-[1.5mm] text-[9.5pt]">
        <p className="pl-[1em] -indent-[1em]">※ご入力いただいた内容は、ご本人様の適切なケアプラン作成および入居判定の参考としてのみ使用し、厳重に管理いたします。</p>
        <p className="pl-[1em] -indent-[1em]">※ご不明な点がございましたら、お気軽にスタッフまでお声がけください。</p>
      </div>

      <footer className="mt-auto ml-auto min-w-[80mm] border-l-[1.2mm] border-[#f4a259] pt-[1mm] pl-[5mm] leading-[1.7]">
        <p className="text-[12pt] font-bold">{facilityName || "　"}</p>
        <p>{desk}</p>
        {(phone || person) && (
          <p>
            {phone && <>電話番号：{phone}</>}
            {phone && person && "　"}
            {person && <>担当：{person}</>}
          </p>
        )}
      </footer>
    </article>
  );
}
