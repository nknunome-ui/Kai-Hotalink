"use client";
import { ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { JudgmentPanel } from "@/components/JudgmentPanel";
import { ProfileForm } from "@/components/ProfileForm";
import { Button, Field, Notice, Step, StepBadge, Textarea, cx } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import { clientStorage, storageErrorMessage } from "@/lib/client/firebase";
import { STEP_LABELS, progressOf, type Progress, type StepKey } from "@/lib/domain/progress";
import type { JudgmentRecord, Resident } from "@/lib/domain/records";
import { labelOf, type SurveyQuestion } from "@/lib/domain/survey";
import { emptyProfile, type ResidentProfile } from "@/lib/domain/types";

interface Detail {
  resident: Resident;
  judgments: JudgmentRecord[];
  questions: SurveyQuestion[];
}

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);

export default function ResidentPage() {
  const { id } = useParams<{ id: string }>();
  const { api, me } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    api<Detail>(`/api/residents/${id}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込めませんでした"));
  }, [api, id, tick]);

  if (error && !data) return <Notice tone="alert">{error}</Notice>;
  if (!data || !me) return <p className="text-mute">読み込み中…</p>;
  const r = data.resident;
  const progress = progressOf(r);

  return (
    <div>
      <Link href="/residents" className="text-[13px] text-ink-soft hover:text-ink">
        ← 入居者の一覧に戻る
      </Link>
      <h1 className="mt-1 mb-4 text-[26px] font-bold">{r.name} 様</h1>
      <ProgressBar progress={progress} />

      <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <DocumentsStep resident={r} facilityId={me.facilityId} progress={progress} onChange={load} />
          <ProfileStep key={r.extraction?.at ?? "manual"} resident={r} progress={progress} onChange={load} />
          <SurveyStep resident={r} questions={data.questions} progress={progress} onChange={load} />
        </div>
        <JudgeStep resident={r} judgments={data.judgments} progress={progress} onChange={load} />
      </div>
    </div>
  );
}

const STEP_ORDER: StepKey[] = ["documents", "profile", "survey", "judge"];

/** 4つの手順の進み具合と、次にやること */
function ProgressBar({ progress }: { progress: Progress }) {
  const { done, next } = progress;
  const go = (k: StepKey) => document.getElementById(`step-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="mb-6 rounded-3xl bg-sheet p-4 shadow-card sm:p-5">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEP_ORDER.map((k, i) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => go(k)}
              className={cx(
                "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[14px] hover:bg-paper",
                next?.step === k && !next.waiting ? "font-bold text-ink" : done[k] ? "text-ink-soft" : "text-mute",
              )}
            >
              <StepBadge n={i + 1} done={done[k]} current={next?.step === k && !next.waiting} />
              {STEP_LABELS[k]}
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {next ? (
          <>
            <p className="text-[15px]">
              <span className="mr-2 text-[13px] text-ink-soft">{next.waiting ? "いまの状態" : "次にやること"}</span>
              <span className="font-bold">{next.text}</span>
            </p>
            {!next.waiting && (
              <Button variant="quiet" className="min-h-9 px-3 text-[13px]" onClick={() => go(next.step)}>
                {STEP_LABELS[next.step]}へ移動
              </Button>
            )}
          </>
        ) : (
          <p className="text-[15px] font-bold text-grade-a">判定まで完了しています</p>
        )}
      </div>
    </div>
  );
}

const stepProps = (k: StepKey, progress: Progress) => ({
  id: `step-${k}`,
  done: progress.done[k],
  current: progress.next?.step === k && !progress.next.waiting,
});

// ---------- 1. 資料と追記 ----------

function DocumentsStep({
  resident,
  facilityId,
  progress,
  onChange,
}: {
  resident: Resident;
  facilityId: string;
  progress: Progress;
  onChange: () => void;
}) {
  const { api } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(busy === "extract");
  const [notes, setNotes] = useState({
    staffNotes: resident.staffNotes,
    interviewNotes: resident.interviewNotes,
    priorFacilityNotes: resident.priorFacilityNotes,
  });
  const dirty =
    notes.staffNotes !== resident.staffNotes ||
    notes.interviewNotes !== resident.interviewNotes ||
    notes.priorFacilityNotes !== resident.priorFacilityNotes;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy("upload");
    try {
      for (const f of Array.from(files)) {
        if (!ALLOWED.includes(f.type)) throw new Error(`${f.name}：PDF・画像（JPEG/PNG/WebP）・テキストのみ登録できます`);
        if (f.size > 20 * 1024 * 1024) throw new Error(`${f.name}：20MB以下のファイルにしてください`);
        const safe = f.name.replace(/[^\w.\-぀-ヿ一-龯]/g, "_").slice(-80);
        const path = `facilities/${facilityId}/residents/${resident.id}/${Date.now()}-${safe}`;
        try {
          await uploadBytes(ref(clientStorage(), path), f, { contentType: f.type });
        } catch (e) {
          throw new Error(storageErrorMessage(e, f.name));
        }
        await api(`/api/residents/${resident.id}/documents`, { method: "POST", body: JSON.stringify({ path, name: f.name }) });
      }
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードできませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function remove(path: string) {
    setBusy(path);
    try {
      await api(`/api/residents/${resident.id}/documents?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    setBusy("notes");
    setError(null);
    try {
      await api(`/api/residents/${resident.id}`, { method: "PATCH", body: JSON.stringify(notes) });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function extract() {
    setBusy("extract");
    setError(null);
    try {
      if (dirty) await api(`/api/residents/${resident.id}`, { method: "PATCH", body: JSON.stringify(notes) });
      await api(`/api/residents/${resident.id}/extract`, { method: "POST" });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取りに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Step
      n={1}
      title="資料と追記"
      status={resident.documents.length ? `資料 ${resident.documents.length}件` : undefined}
      {...stepProps("documents", progress)}
    >
      <p className="mb-4 text-[14px] text-ink-soft">
        主治医意見書・ケアプラン・看護サマリーなどをアップロードし、資料にない情報を追記します。
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-brand-tint px-4 py-7 text-center transition-colors hover:bg-brand-soft">
        <span className="text-[15px] font-semibold text-brand-strong">{busy === "upload" ? "アップロード中…" : "ファイルを選ぶ"}</span>
        <span className="text-[12px] text-mute">PDF・写真（JPEG/PNG/WebP）・テキスト、1件20MBまで</span>
        <input
          type="file"
          multiple
          accept=".pdf,image/jpeg,image/png,image/webp,.txt"
          className="sr-only"
          disabled={busy !== null}
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {resident.documents.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-paper">
          {resident.documents.map((d) => (
            <li key={d.path} className="flex items-center gap-3 px-3 py-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="text-[12px] text-mute">{kb(d.size)}</span>
              <Button variant="danger" className="min-h-8 px-2 text-[13px]" busy={busy === d.path} onClick={() => remove(d.path)}>
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 space-y-4">
        <Field label="病状・個人情報の追記" hint="資料と食い違う場合は、こちらの内容を優先して読み取ります。">
          <Textarea rows={4} value={notes.staffNotes} onChange={(e) => setNotes({ ...notes, staffNotes: e.target.value })} />
        </Field>
        <Field label="面談メモ">
          <Textarea rows={3} value={notes.interviewNotes} onChange={(e) => setNotes({ ...notes, interviewNotes: e.target.value })} />
        </Field>
        <Field label="前施設・ケアマネからの申し送り（トラブル情報など）" hint="施設内の共有用です。判定の点数には使いません。">
          <Textarea rows={3} value={notes.priorFacilityNotes} onChange={(e) => setNotes({ ...notes, priorFacilityNotes: e.target.value })} />
        </Field>
      </div>

      {error && <div className="mt-4"><Notice tone="alert">{error}</Notice></div>}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={extract} busy={busy === "extract"} disabled={busy !== null && busy !== "extract"}>
          {resident.profile ? "AIでもう一度読み取る" : "AIで状態を読み取る"}
        </Button>
        {dirty && (
          <Button variant="quiet" onClick={saveNotes} busy={busy === "notes"}>
            追記を保存
          </Button>
        )}
      </div>
      {busy === "extract" && (
        <p className="mt-2 text-[13px] text-ink-soft" aria-live="polite">
          資料を読み取っています（{elapsed}秒）。資料の量によって1〜2分かかります。この画面のままお待ちください。
        </p>
      )}
    </Step>
  );
}

// ---------- 2. 状態の確認 ----------

function ProfileStep({ resident, progress, onChange }: { resident: Resident; progress: Progress; onChange: () => void }) {
  const { api } = useAuth();
  const [draft, setDraft] = useState<ResidentProfile>(resident.profile ?? emptyProfile());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/residents/${resident.id}`, { method: "PATCH", body: JSON.stringify({ profile: draft }) });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const status = !resident.profile
    ? "未登録"
    : resident.profileConfirmed
      ? "確認済み"
      : "AIの読み取り結果・未確認";

  return (
    <Step n={2} title="状態の確認" status={status} {...stepProps("profile", progress)}>
      {resident.profile && !resident.profileConfirmed && (
        <div className="mb-4">
          <Notice>
            AI が読み取った内容です。各項目の下の「根拠」を見て、違うところを直してから保存してください。根拠がない項目は、資料に記載が見つからなかったものです。判定は保存後に行えます。
          </Notice>
        </div>
      )}
      {resident.extraction && resident.extraction.uncertain.length > 0 && (
        <div className="mb-5 rounded-2xl bg-paper p-4">
          <h3 className="mb-1 text-[14px] font-bold">面談で確認したい点</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-[14px]">
            {resident.extraction.uncertain.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-mute">
            {fmt(resident.extraction.at)} 読み取り（{resident.extraction.model}）
          </p>
        </div>
      )}
      {!resident.profile && (
        <p className="mb-4 text-[14px] text-ink-soft">
          1 で AI に読み取らせるか、下の項目を直接入力して保存してください。
        </p>
      )}
      <ProfileForm value={draft} onChange={setDraft} ai={resident.extraction?.profile} evidence={resident.extraction?.evidence} />
      {error && <div className="mt-4"><Notice tone="alert">{error}</Notice></div>}
      <Button className="mt-5" onClick={save} busy={busy}>
        {resident.profileConfirmed ? "変更を保存" : "確認して保存"}
      </Button>
    </Step>
  );
}

// ---------- 3. 家族アンケート ----------

function SurveyStep({
  resident,
  questions,
  progress,
  onChange,
}: {
  resident: Resident;
  questions: SurveyQuestion[];
  progress: Progress;
  onChange: () => void;
}) {
  const { api } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = resident.survey;
  const hasDynamic = questions.some((q) => q.dynamic);

  async function issue() {
    if (s && !confirm("URLを発行し直すと、前のURLは使えなくなります。発行しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string }>(`/api/residents/${resident.id}/survey-link`, { method: "POST" });
      setUrl(res.url);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const status = !s ? "未発行" : s.submittedAt ? `${fmt(s.submittedAt)} 回答` : `回答待ち（${fmt(s.expiresAt)}まで有効）`;

  return (
    <Step n={3} title="家族アンケート" status={status} {...stepProps("survey", progress)}>
      <p className="mb-4 text-[14px] text-ink-soft">
        URLを発行して、ご家族にメールやLINEで送ってください。ログインなしで、スマホから回答できます。
        {!s && !resident.profileConfirmed && " 先に 2 の状態を保存しておくと、医療的ケアに応じた設問が自動で追加されます。"}
      </p>
      {hasDynamic && !s?.submittedAt && (
        <p className="mb-4 text-[13px] text-ink-soft">医療的ケアがあるため「急変時の対応」の設問を追加しています。</p>
      )}

      {url && (
        <div className="mb-4 rounded-2xl border-2 border-brand-soft bg-brand-tint p-3">
          <p className="mb-2 text-[13px] font-semibold">ご家族に送るURL（この画面を閉じると再表示できません）</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={url} className="min-w-0 flex-1 rounded-xl border-2 border-line bg-sheet px-3 py-1.5 text-[13px]" onFocus={(e) => e.target.select()} />
            <Button
              variant="quiet"
              className="min-h-9 text-[13px]"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? "コピーしました" : "コピー"}
            </Button>
          </div>
        </div>
      )}

      {error && <div className="mb-4"><Notice tone="alert">{error}</Notice></div>}

      <div className="flex flex-wrap gap-3">
        <Button variant={s ? "quiet" : "primary"} onClick={issue} busy={busy}>
          {s ? "URLを発行し直す" : "アンケートURLを発行"}
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-mute">紙で回答してもらった場合は、このURLを開いてスタッフが代わりに入力できます。</p>

      {s?.submittedAt && s.answers && (
        <dl className="mt-6 divide-y divide-line rounded-2xl bg-paper">
          {questions.map((q) => {
            const a = s.answers![q.id];
            const shown =
              q.type === "text"
                ? (a as string) || "（記入なし）"
                : (Array.isArray(a) ? a : a ? [a] : []).map((v) => labelOf(questions, q.id, v)).join("、") || "（未回答）";
            const follow = q.followUp ? (s.answers![q.followUp.id] as string | undefined) : undefined;
            return (
              <div key={q.id} className="px-4 py-3">
                <dt className="text-[13px] text-ink-soft">{q.text}</dt>
                <dd className="mt-0.5 text-[14px] font-semibold whitespace-pre-wrap">
                  {shown}
                  {follow && <span className="mt-1 block font-normal">{follow}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Step>
  );
}

// ---------- 4. 判定 ----------

function JudgeStep({
  resident,
  judgments,
  progress,
  onChange,
}: {
  resident: Resident;
  judgments: JudgmentRecord[];
  progress: Progress;
  onChange: () => void;
}) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const latest = judgments[0];
  const canJudge = Boolean(resident.profile && resident.profileConfirmed);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ judgment: JudgmentRecord }>(`/api/residents/${resident.id}/judge`, { method: "POST" });
      setFreshId(res.judgment.id);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "判定できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside id="step-judge" className="scroll-mt-6 lg:sticky lg:top-6 lg:self-start">
      <div
        className={cx(
          "rounded-3xl border-2 bg-sheet p-5 shadow-card",
          progress.next?.step === "judge" ? "border-brand" : "border-transparent",
        )}
      >
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={4} done={progress.done.judge} current={progress.next?.step === "judge"} />
          <h2 className="text-[18px] font-bold">入居判定</h2>
        </div>
        {progress.stale && (
          <div className="mb-4">
            <Notice>前回の判定のあとで、資料・状態・アンケートが変わりました。もう一度判定してください。</Notice>
          </div>
        )}
        {!canJudge && (
          <p className="mb-4 text-[14px] text-ink-soft">2 で状態を確認・保存すると判定できます。家族アンケートの回答がなくても判定できます。</p>
        )}
        {canJudge && !resident.survey?.submittedAt && (
          <p className="mb-4 text-[13px] text-ink-soft">家族アンケートの回答がまだないため、「事前に説明すべき点」は出ません。</p>
        )}
        {error && <div className="mb-4"><Notice tone="alert">{error}</Notice></div>}
        <Button onClick={run} busy={busy} disabled={!canJudge} className="w-full">
          {latest ? "最新の情報でもう一度判定" : "判定する"}
        </Button>

        {latest && (
          <div className="mt-6 border-t border-line pt-6">
            <JudgmentPanel record={latest} fresh={latest.id === freshId} />
          </div>
        )}
        <p className="mt-6 text-[12px] text-mute">判定は判断材料です。入居の可否は施設の担当者が決めてください。</p>
      </div>
    </aside>
  );
}

/** 処理中の経過秒数（長い処理で止まっていないことを見せる） */
function useElapsed(running: boolean) {
  const [sec, setSec] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = Date.now();
    const t = setInterval(() => setSec(Math.floor((Date.now() - start.current) / 1000)), 1000);
    return () => {
      clearInterval(t);
      setSec(0);
    };
  }, [running]);
  return sec;
}
