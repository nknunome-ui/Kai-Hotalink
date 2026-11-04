import "server-only";
import { HttpError } from "./http";

// メールの送信（Resend の API を使う）。RESEND_API_KEY が無ければ送らず、
// 画面側で Firebase のメール（パスワード再設定メール）に切り替える。

export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY);

const FROM = () => process.env.MAIL_FROM || "HotaLink <noreply@hotalink.jp>";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text().catch(() => ""));
    throw new HttpError(502, "メールを送れませんでした。時間をおいてもう一度お試しいただくか、「リンクを作る」からリンクを本人に送ってください");
  }
}

// ---------- 文面 ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(paragraphs: string[], button: { label: string; link: string }, after: string[]): string {
  const p = (t: string) => `<p style="margin:0 0 16px;line-height:1.7">${t}</p>`;
  return `<!doctype html><html lang="ja"><body style="margin:0;background:#fff8f1;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',Meiryo,sans-serif;color:#3b302a">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#ffffff;border-radius:24px;padding:28px 24px">
<p style="margin:0 0 20px;font-size:24px;font-weight:bold;color:#c2550f">HotaLink</p>
${paragraphs.map(p).join("\n")}
<p style="margin:24px 0;text-align:center"><a href="${esc(button.link)}" style="display:inline-block;background:#c2550f;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">${esc(button.label)}</a></p>
${after.map((t) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#6b5a4e">${t}</p>`).join("\n")}
<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#7d6c60;word-break:break-all">ボタンが押せないときは、次の URL をブラウザに貼り付けてください。<br>${esc(button.link)}</p>
</div>
<p style="margin:16px 0 0;font-size:12px;color:#7d6c60;text-align:center">HotaLink　家族と施設 共にささえる 想いをつなぐ</p>
</div></body></html>`;
}

const ROLE = { admin: "管理者", staff: "スタッフ" } as const;

/** 招待メール（施設の追加・管理者の追加・スタッフの招待） */
export function inviteMail(to: string, facilityName: string, role: "admin" | "staff", link: string): Mail {
  const facility = facilityName || "施設";
  return {
    to,
    subject: `【HotaLink】${facility}に招待されました`,
    html: layout(
      [
        `${esc(to)} 様`,
        `HotaLink（入居相談の支援サービス）の「${esc(facility)}」に、${ROLE[role]}として招待されました。`,
        "下のボタンからパスワードを決めると、そのままログインして使い始められます。",
      ],
      { label: "パスワードを決めて始める", link },
      [
        "このリンクの有効期限は1時間です。期限が切れたときは、招待した方に送り直しを依頼してください。",
        "お心当たりがない場合は、このメールを破棄してください。",
      ],
    ),
    text: [
      `${to} 様`,
      "",
      `HotaLink（入居相談の支援サービス）の「${facility}」に、${ROLE[role]}として招待されました。`,
      "次のリンクからパスワードを決めると、そのままログインして使い始められます。",
      "",
      link,
      "",
      "このリンクの有効期限は1時間です。期限が切れたときは、招待した方に送り直しを依頼してください。",
      "お心当たりがない場合は、このメールを破棄してください。",
      "",
      "HotaLink",
    ].join("\n"),
  };
}

/** パスワード再設定メール（「パスワードを忘れた方」） */
export function resetMail(to: string, link: string): Mail {
  return {
    to,
    subject: "【HotaLink】パスワードの再設定",
    html: layout(
      [`${esc(to)} 様`, "HotaLink のパスワード再設定の手続きを受け付けました。", "下のボタンから、新しいパスワードを決めてください。決めると、そのままログインできます。"],
      { label: "新しいパスワードを決める", link },
      [
        "このリンクの有効期限は1時間です。期限が切れたときは、ログイン画面の「パスワードを忘れた方」からもう一度お手続きください。",
        "お心当たりがない場合は、このメールを破棄してください。パスワードは変わりません。",
      ],
    ),
    text: [
      `${to} 様`,
      "",
      "HotaLink のパスワード再設定の手続きを受け付けました。",
      "次のリンクから、新しいパスワードを決めてください。決めると、そのままログインできます。",
      "",
      link,
      "",
      "このリンクの有効期限は1時間です。期限が切れたときは、ログイン画面の「パスワードを忘れた方」からもう一度お手続きください。",
      "お心当たりがない場合は、このメールを破棄してください。パスワードは変わりません。",
      "",
      "HotaLink",
    ].join("\n"),
  };
}
