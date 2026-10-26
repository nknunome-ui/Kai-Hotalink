"use client";
import { useEffect, useState } from "react";
import { GradeLantern } from "@/components/GradeLantern";
import { Button, Field, Input, Notice, Segmented, Select, cx } from "@/components/ui";
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
  type Thresholds,
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

const SUPPORT: [keyof Acceptance, string][] = [
  ["nightNurse", "夜間も看護師が常駐"],
  ["endOfLifeCare", "看取りに対応"],
  ["contactsMinorChanges", "小さな変化でもご家族に連絡"],
  ["routineReport", "月1回程度の定期報告"],
];

type Strictness = "lenient" | "normal" | "strict";
const STRICTNESS: Record<Strictness, { label: string; thresholds: Thresholds }> = {
  lenient: { label: "ゆるめ", thresholds: { a: 25, b: 45, c: 65 } },
  normal: { label: "ふつう", thresholds: { a: 20, b: 40, c: 60 } },
  strict: { label: "きびしめ", thresholds: { a: 15, b: 35, c: 55 } },
};

function strictnessOf(t: Thresholds): Strictness | "custom" {
  const hit = (Object.keys(STRICTNESS) as Strictness[]).find((k) => {
    const x = STRICTNESS[k].thresholds;
    return x.a === t.a && x.b === t.b && x.c === t.c;
  });
  return hit ?? "custom";
}

/** 受け入れていない項目の一覧（設定画面の上に出す） */
function refusedItems(acc: Acceptance): string[] {
  const out: string[] = [];
  if (acc.suction === "none") out.push("たん吸引が必要な方");
  else if (acc.suction === "day") out.push("夜間のたん吸引が必要な方");
  for (const [k, l] of MEDICAL) if (!acc[k]) out.push(`${l}の方`);
  if (acc.maxCareLevel < 7) out.push(`${CARE_LEVEL_LABELS[(acc.maxCareLevel + 1) as CareLevel]}以上の方`);
  if (acc.maxDementiaLevel < 4) out.push(`認知症が「${DEMENTIA_LABELS[(acc.maxDementiaLevel + 1) as DementiaLevel].split("（")[0]}」以上の方`);
  if (!acc.acceptsBedridden) out.push("寝たきりの方");
  if (!acc.acceptsWandering) out.push("徘徊のある方");
  if (!acc.acceptsAggression) out.push("暴言・暴力のある方");
  return out;
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-sheet p-5 shadow-card sm:p-6">
      <h2 className="text-[18px] font-bold">{title}</h2>
      {note && <p className="mt-0.5 mb-3 text-[13px] text-ink-soft">{note}</p>}
      <div className={note ? undefined : "mt-3"}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[15px] font-bold">{label}</p>
        {hint && <p className="text-[12px] text-mute">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Segmented<"yes" | "no">
      label={label}
      value={value ? "yes" : "no"}
      onChange={(v) => onChange(v === "yes")}
      options={[
        { value: "yes", label: "受け入れる" },
        { value: "no", label: "受け入れない", tone: "no" },
      ]}
    />
  );
}

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
  const dirty = JSON.stringify(s) !== JSON.stringify(rec.settings);
  const refused = refusedItems(acc);
  const strictness = strictnessOf(s.thresholds);

  return (
    <div className={cx("max-w-3xl", dirty && isAdmin && "pb-28")}>
      <h1 className="mb-1 text-[24px] font-bold">受け入れ設定</h1>
      <p className="mb-6 text-[14px] text-ink-soft">
        施設で受け入れられる方の範囲を決めます。ここで「受け入れない」にした項目に当てはまる方は、判定が D（2つ以上なら E）になります。
        <br />
        <span className="text-mute">
          現在の設定：v{rec.version}
          {rec.updatedAt && `（${fmt(rec.updatedAt)} 更新）`}
        </span>
      </p>
      {!isAdmin && (
        <div className="mb-6">
          <Notice>設定を変更できるのは施設の管理者だけです。内容の確認はできます。</Notice>
        </div>
      )}

      <section className="mb-6 rounded-3xl border-2 border-brand-soft bg-brand-tint p-5">
        <h2 className="text-[15px] font-bold">この施設で受け入れていない方</h2>
        {refused.length === 0 ? (
          <p className="mt-1 text-[14px] text-ink-soft">受け入れの制限はありません。</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {refused.map((x) => (
              <li key={x} className="rounded-full bg-sheet px-3 py-1 text-[13px] font-bold text-ink-soft">
                {x}
              </li>
            ))}
          </ul>
        )}
      </section>

      <fieldset disabled={!isAdmin} className="space-y-6">
        <Card title="施設の名前">
          <Field label="施設名" hint="家族アンケートの画面や、同意書の文案に表示されます。">
            <Input value={s.facilityName} maxLength={100} onChange={(e) => setAll({ facilityName: e.target.value })} />
          </Field>
        </Card>

        <Card title="医療的ケア" note="対応できる医療的ケアを選んでください。">
          <Row label="たん吸引">
            <Segmented<SuctionCapability>
              label="たん吸引"
              value={acc.suction}
              onChange={(v) => setAcc({ suction: v })}
              options={[
                { value: "both", label: "日中・夜間" },
                { value: "day", label: "日中のみ" },
                { value: "none", label: "対応しない", tone: "no" },
              ]}
            />
          </Row>
          {MEDICAL.map(([k, l]) => (
            <Row key={k} label={l}>
              <YesNo label={l} value={acc[k] as boolean} onChange={(v) => setAcc({ [k]: v })} />
            </Row>
          ))}
        </Card>

        <Card title="介護度・認知症" note="どの程度の方まで受け入れるかを選んでください。">
          <Row label="要介護度">
            <Select
              aria-label="受け入れる要介護度の上限"
              className="w-auto min-w-44"
              value={acc.maxCareLevel}
              onChange={(e) => setAcc({ maxCareLevel: Number(e.target.value) as CareLevel })}
            >
              {Object.entries(CARE_LEVEL_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}まで
                </option>
              ))}
            </Select>
          </Row>
          <Row label="認知症の程度">
            <Select
              aria-label="受け入れる認知症の程度の上限"
              className="w-auto min-w-44"
              value={acc.maxDementiaLevel}
              onChange={(e) => setAcc({ maxDementiaLevel: Number(e.target.value) as DementiaLevel })}
            >
              {Object.entries(DEMENTIA_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l.split("（")[0]}まで
                </option>
              ))}
            </Select>
          </Row>
          <Row label="寝たきりの方">
            <YesNo label="寝たきりの方" value={acc.acceptsBedridden} onChange={(v) => setAcc({ acceptsBedridden: v })} />
          </Row>
          <Row label="徘徊のある方">
            <YesNo label="徘徊のある方" value={acc.acceptsWandering} onChange={(v) => setAcc({ acceptsWandering: v })} />
          </Row>
          <Row label="暴言・暴力のある方">
            <YesNo label="暴言・暴力のある方" value={acc.acceptsAggression} onChange={(v) => setAcc({ acceptsAggression: v })} />
          </Row>
        </Card>

        <Card title="施設の体制" note="判定の A〜E には影響しません。ご家族への事前説明や、同意書の文案に使います。">
          {SUPPORT.map(([k, l]) => (
            <Row key={k} label={l}>
              <Segmented<"yes" | "no">
                label={l}
                value={acc[k] ? "yes" : "no"}
                onChange={(v) => setAcc({ [k]: v === "yes" })}
                options={[
                  { value: "yes", label: "している" },
                  { value: "no", label: "していない", tone: "no" },
                ]}
              />
            </Row>
          ))}
        </Card>

        <Card title="判定の基準" note="迷ったら「標準」「ふつう」のままで大丈夫です。">
          <p className="mb-2 text-[14px] font-bold">施設の得意なケア</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(PRESETS) as PresetId[]).map((id) => (
              <label
                key={id}
                className={cx(
                  "cursor-pointer rounded-2xl border-2 p-3",
                  s.preset === id ? "border-brand bg-brand-tint" : "border-line bg-sheet hover:border-brand-soft",
                )}
              >
                <input
                  type="radio"
                  name="preset"
                  className="sr-only"
                  checked={s.preset === id}
                  onChange={() => setAll({ preset: id, weights: { ...PRESETS[id].weights } })}
                />
                <span className="block text-[15px] font-bold">{PRESETS[id].label}</span>
                <span className="block text-[12px] text-ink-soft">{PRESETS[id].description}</span>
              </label>
            ))}
          </div>

          <div className="mt-5 space-y-1">
            <Row label="判定のきびしさ" hint="きびしめにすると、同じ方でも判定が下がりやすくなります。">
              <Segmented<Strictness | "custom">
                label="判定のきびしさ"
                value={strictness}
                onChange={(v) => v !== "custom" && setAll({ thresholds: { ...STRICTNESS[v].thresholds } })}
                options={[
                  ...(Object.keys(STRICTNESS) as Strictness[]).map((k) => ({ value: k, label: STRICTNESS[k].label })),
                  ...(strictness === "custom" ? [{ value: "custom" as const, label: "細かく設定中" }] : []),
                ]}
              />
            </Row>
            <Row label="ご家族とのずれの表示" hint="判定の A〜E には影響しません。表示する量だけを変えます。">
              <Segmented<GapSensitivity>
                label="ご家族とのずれの表示"
                value={s.gapSensitivity}
                onChange={(v) => setAll({ gapSensitivity: v })}
                options={[
                  { value: "low", label: "大きなずれだけ" },
                  { value: "normal", label: "ふつう" },
                  { value: "high", label: "小さなずれも" },
                ]}
              />
            </Row>
          </div>

          <details className="mt-4 rounded-2xl bg-paper">
            <summary className="cursor-pointer px-4 py-3 text-[14px] font-bold text-ink-soft">さらに細かく調整する（上級者向け）</summary>
            <div className="space-y-5 px-4 pb-4">
              <div>
                <p className="mb-2 text-[13px] text-ink-soft">
                  リスク点（0〜100）がこの値未満なら、その判定になります。受け入れ範囲外の項目がない限り、C の境目以上は D です。
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
            </div>
          </details>
        </Card>
      </fieldset>

      {msg && <div className="mt-6"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {isAdmin && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t-4 border-brand-soft bg-sheet/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
            <p className="mr-auto text-[14px] font-bold">保存していない変更があります</p>
            <Button variant="quiet" onClick={() => setS(rec.settings)}>
              元に戻す
            </Button>
            <Button variant="quiet" onClick={simulate} busy={busy === "sim"}>
              判定がどう変わるか試算
            </Button>
            <Button onClick={save} busy={busy === "save"}>
              保存する
            </Button>
          </div>
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
