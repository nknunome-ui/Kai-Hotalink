"use client";
import { useEffect, useState } from "react";
import { GradeLantern } from "@/components/GradeLantern";
import { Button, Check, Field, Input, Notice, Select } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import { PRESETS } from "@/lib/domain/presets";
import type { SettingsHistoryEntry, SettingsRecord } from "@/lib/domain/records";
import {
  CARE_LEVEL_LABELS,
  DEMENTIA_LABELS,
  type Acceptance,
  type CareLevel,
  type DementiaLevel,
  type FacilitySettings,
  type GapSensitivity,
  type Grade,
  type PresetId,
  type SuctionCapability,
} from "@/lib/domain/types";

interface SimRow {
  id: string;
  name: string;
  before: { grade: Grade; riskScore: number; gaps: number };
  after: { grade: Grade; riskScore: number; gaps: number };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

const MEDICAL: [keyof Acceptance, string][] = [
  ["gastrostomy", "胃ろう・経管栄養"],
  ["tracheostomy", "気管切開"],
  ["oxygen", "在宅酸素"],
  ["insulin", "インスリン注射"],
  ["urinaryCatheter", "尿道カテーテル"],
  ["dialysis", "人工透析"],
  ["pressureUlcer", "褥瘡の処置"],
];

export default function SettingsPage() {
  const { api, me, refreshMe } = useAuth();
  const [rec, setRec] = useState<SettingsRecord | null>(null);
  const [s, setS] = useState<FacilitySettings | null>(null);
  const [history, setHistory] = useState<SettingsHistoryEntry[]>([]);
  const [sim, setSim] = useState<SimRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "alert"; text: string } | null>(null);
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    Promise.all([api<SettingsRecord>("/api/settings"), api<{ history: SettingsHistoryEntry[] }>("/api/settings/history")])
      .then(([r, h]) => {
        setRec(r);
        setS(r.settings);
        setHistory(h.history);
      })
      .catch((e) => setMsg({ tone: "alert", text: e.message }));
  }, [api]);

  if (!s || !rec) return msg ? <Notice tone="alert">{msg.text}</Notice> : <p className="text-mute">読み込み中…</p>;

  const acc = s.acceptance;
  const setAcc = (patch: Partial<Acceptance>) => {
    setS({ ...s, acceptance: { ...acc, ...patch } });
    setSim(null);
  };
  const setAll = (patch: Partial<FacilitySettings>) => {
    setS({ ...s, ...patch });
    setSim(null);
  };

  async function simulate() {
    setBusy("sim");
    setMsg(null);
    try {
      const r = await api<{ rows: SimRow[] }>("/api/settings/simulate", { method: "POST", body: JSON.stringify({ settings: s }) });
      setSim(r.rows);
    } catch (e) {
      setMsg({ tone: "alert", text: e instanceof Error ? e.message : "試算できませんでした" });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<SettingsRecord>("/api/settings", { method: "PUT", body: JSON.stringify({ settings: s }) });
      setRec(r);
      setS(r.settings);
      const h = await api<{ history: SettingsHistoryEntry[] }>("/api/settings/history");
      setHistory(h.history);
      await refreshMe();
      setMsg({ tone: "info", text: `設定を保存しました（v${r.version}）。これ以降の判定に使われます。` });
    } catch (e) {
      setMsg({ tone: "alert", text: e instanceof Error ? e.message : "保存できませんでした" });
    } finally {
      setBusy(null);
    }
  }

  const changed = sim?.filter((r) => r.before.grade !== r.after.grade) ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-[24px] font-bold">受け入れ設定</h1>
      <p className="mb-6 text-[14px] text-ink-soft">
        施設が対応できる範囲と、判定の基準を決めます。現在の設定：v{rec.version}
        {rec.updatedAt && `（${fmt(rec.updatedAt)} 更新）`}
        {!isAdmin && "。設定の変更は施設の管理者のみ行えます。"}
      </p>

      <fieldset disabled={!isAdmin} className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-[18px] font-bold">施設</h2>
          <Field label="施設名" hint="家族アンケートの画面や同意書の文案に表示されます。">
            <Input value={s.facilityName} maxLength={100} onChange={(e) => setAll({ facilityName: e.target.value })} />
          </Field>
        </section>

        <section>
          <h2 className="mb-1 text-[18px] font-bold">受け入れ範囲</h2>
          <p className="mb-4 text-[14px] text-ink-soft">ここで対応できないとした項目に当てはまる方は、判定が D（2つ以上なら E）になります。</p>

          <h3 className="mb-2 text-[15px] font-bold">医療的ケア</h3>
          <div className="mb-3 grid gap-4 sm:grid-cols-2">
            <Field label="たん吸引">
              <Select value={acc.suction} onChange={(e) => setAcc({ suction: e.target.value as SuctionCapability })}>
                <option value="none">対応しない</option>
                <option value="day">日中のみ対応</option>
                <option value="both">日中・夜間とも対応</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {MEDICAL.map(([k, l]) => (
              <Check key={k} label={`${l}に対応できる`} checked={acc[k] as boolean} onChange={(v) => setAcc({ [k]: v })} />
            ))}
          </div>

          <h3 className="mt-6 mb-2 text-[15px] font-bold">身体・認知</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="受け入れる要介護度の上限">
              <Select value={acc.maxCareLevel} onChange={(e) => setAcc({ maxCareLevel: Number(e.target.value) as CareLevel })}>
                {Object.entries(CARE_LEVEL_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}まで
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="受け入れる認知症の程度の上限">
              <Select value={acc.maxDementiaLevel} onChange={(e) => setAcc({ maxDementiaLevel: Number(e.target.value) as DementiaLevel })}>
                {Object.entries(DEMENTIA_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l.split("（")[0]}まで
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
            <Check label="寝たきりの方を受け入れる" checked={acc.acceptsBedridden} onChange={(v) => setAcc({ acceptsBedridden: v })} />
            <Check label="徘徊のある方を受け入れる" checked={acc.acceptsWandering} onChange={(v) => setAcc({ acceptsWandering: v })} />
            <Check label="暴言・暴力のある方を受け入れる" checked={acc.acceptsAggression} onChange={(v) => setAcc({ acceptsAggression: v })} />
          </div>

          <h3 className="mt-6 mb-2 text-[15px] font-bold">体制</h3>
          <p className="mb-2 text-[13px] text-ink-soft">家族の希望とのずれ（事前に説明すべき点）や、同意書の文案に使います。</p>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Check label="夜間も看護師が常駐している" checked={acc.nightNurse} onChange={(v) => setAcc({ nightNurse: v })} />
            <Check label="看取りに対応している" checked={acc.endOfLifeCare} onChange={(v) => setAcc({ endOfLifeCare: v })} />
            <Check label="小さな変化でも家族に連絡している" checked={acc.contactsMinorChanges} onChange={(v) => setAcc({ contactsMinorChanges: v })} />
            <Check label="月1回程度の定期報告をしている" checked={acc.routineReport} onChange={(v) => setAcc({ routineReport: v })} />
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-[18px] font-bold">判定の基準</h2>
          <p className="mb-4 text-[14px] text-ink-soft">施設の得意なケアに合わせて選びます。迷ったら「標準」のままで大丈夫です。</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(PRESETS) as PresetId[]).map((id) => (
              <label
                key={id}
                className={`cursor-pointer rounded-xl border p-3 ${s.preset === id ? "border-brand bg-brand-tint" : "border-line bg-sheet"}`}
              >
                <input
                  type="radio"
                  name="preset"
                  className="sr-only"
                  checked={s.preset === id}
                  onChange={() => setAll({ preset: id, weights: { ...PRESETS[id].weights }, thresholds: { ...PRESETS[id].thresholds } })}
                />
                <span className="block text-[15px] font-semibold">{PRESETS[id].label}</span>
                <span className="block text-[12px] text-ink-soft">{PRESETS[id].description}</span>
              </label>
            ))}
          </div>

          <details className="mt-4 rounded-2xl bg-sheet shadow-card">
            <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold">細かく調整する</summary>
            <div className="space-y-5 border-t border-line px-4 py-4">
              <div>
                <p className="mb-2 text-[13px] text-ink-soft">
                  リスク点（0〜100）がこの値未満なら、その判定になります。足切りに当たらない限り、C の境目以上は D です。
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {(["a", "b", "c"] as const).map((k) => (
                    <Field key={k} label={`${k.toUpperCase()} の境目`}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={s.thresholds[k]}
                        onChange={(e) => setAll({ thresholds: { ...s.thresholds, [k]: Number(e.target.value) } })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[13px] text-ink-soft">項目の重み（0〜3）。得意な分野ほど小さくします。</p>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["medical", "医療"],
                      ["physical", "身体・転倒"],
                      ["cognition", "認知・行動"],
                    ] as const
                  ).map(([k, l]) => (
                    <Field key={k} label={l}>
                      <Input
                        type="number"
                        min={0}
                        max={3}
                        step={0.1}
                        value={s.weights[k]}
                        onChange={(e) => setAll({ weights: { ...s.weights, [k]: Number(e.target.value) } })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
              <Field label="事前に説明すべき点の表示" hint="家族の回答は ABCDE には影響しません。ここでは表示する量だけを変えます。">
                <Select value={s.gapSensitivity} onChange={(e) => setAll({ gapSensitivity: e.target.value as GapSensitivity })}>
                  <option value="low">大きなずれだけ表示</option>
                  <option value="normal">中程度以上を表示（標準）</option>
                  <option value="high">小さなずれも表示</option>
                </Select>
              </Field>
            </div>
          </details>
        </section>
      </fieldset>

      {msg && <div className="mt-6"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {isAdmin && (
        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <Button variant="quiet" onClick={simulate} busy={busy === "sim"}>
            保存前に試算する
          </Button>
          <Button onClick={save} busy={busy === "save"}>
            設定を保存
          </Button>
        </div>
      )}

      {sim && (
        <section className="mt-6">
          <h2 className="mb-1 text-[16px] font-bold">試算結果</h2>
          <p className="mb-3 text-[13px] text-ink-soft">
            状態を登録済みの最近の {sim.length} 人のうち、判定が変わるのは {changed.length} 人です。
          </p>
          {sim.length > 0 && (
            <ul className="divide-y divide-line rounded-2xl bg-sheet shadow-card">
              {sim.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-[14px]">
                  <span className="min-w-0 flex-1 truncate">{r.name} 様</span>
                  <GradeLantern grade={r.before.grade} size="sm" />
                  <span className="text-mute" aria-hidden>
                    から
                  </span>
                  <GradeLantern grade={r.after.grade} size="sm" />
                  <span className={`w-16 text-right text-[12px] ${r.before.grade !== r.after.grade ? "font-semibold text-alert" : "text-mute"}`}>
                    {r.before.grade !== r.after.grade ? "変わる" : "同じ"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-2 text-[16px] font-bold">変更履歴</h2>
        {history.length === 0 ? (
          <p className="text-[14px] text-ink-soft">まだ変更はありません。</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl bg-sheet shadow-card text-[14px]">
            {history.map((h) => (
              <li key={h.version} className="flex flex-wrap gap-x-4 px-4 py-2">
                <span className="font-semibold">v{h.version}</span>
                <span className="text-ink-soft">{fmt(h.changedAt)}</span>
                <span className="text-ink-soft">{h.changedBy}</span>
                <span className="text-mute">基準：{PRESETS[h.settings.preset]?.label ?? h.settings.preset}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
