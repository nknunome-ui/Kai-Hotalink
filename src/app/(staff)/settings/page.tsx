"use client";
import { useEffect, useState } from "react";
import { GradeLantern } from "@/components/GradeLantern";
import { Button, Field, Input, Notice, Segmented, Select, cx } from "@/components/ui";
import { useAuth } from "@/lib/client/auth";
import {
  MEDICAL_CARE,
  MEDICAL_GROUPS,
  type CareCapacities,
  type CareCapacity,
  type MedicalCapability,
  type MedicalCareId,
  type NurseStaffing,
} from "@/lib/domain/medical";
import { PRESETS } from "@/lib/domain/presets";
import type { SettingsHistoryEntry, SettingsRecord } from "@/lib/domain/records";
import {
  CARE_LEVEL_LABELS,
  DEMENTIA_LABELS,
  type Accept,
  type Acceptance,
  type CareLevel,
  type DementiaLevel,
  type FacilitySettings,
  type GapSensitivity,
  type Grade,
  type PresetId,
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

const SUPPORT: ["contactsMinorChanges" | "routineReport", string][] = [
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

type Summary = Record<Accept, string[]>;

/** 続いている段階をまとめて「要支援1〜要介護3」のように書く */
function ranges<K extends number>(levels: Record<K, Accept>, labels: Record<K, string>, want: Accept): string[] {
  const keys = (Object.keys(levels).map(Number) as K[]).sort((a, b) => a - b);
  const out: string[] = [];
  let from: K | null = null;
  keys.forEach((k, i) => {
    const hit = levels[k] === want;
    if (hit && from === null) from = k;
    const nextHit = i + 1 < keys.length && levels[keys[i + 1]] === want;
    if (hit && !nextHit && from !== null) {
      out.push(from === k ? labels[k] : `${labels[from]}〜${labels[k]}`);
      from = null;
    }
  });
  return out;
}

const DEMENTIA_SHORT = Object.fromEntries(
  Object.entries(DEMENTIA_LABELS).map(([k, l]) => [k, l.split("（")[0]]),
) as Record<DementiaLevel, string>;

/** 受け入れる・検討・受け入れない方の一覧（設定画面の上に出す） */
function summarize(acc: Acceptance): Summary {
  const out: Summary = { yes: [], review: [], no: [] };
  for (const a of ["yes", "review", "no"] as Accept[]) {
    for (const r of ranges(acc.careLevels, CARE_LEVEL_LABELS, a)) out[a].push(`${r}の方`);
    for (const r of ranges(acc.dementiaLevels, DEMENTIA_SHORT, a)) {
      out[a].push(r === "なし" ? "認知症のない方" : r.startsWith("なし〜") ? `認知症が「${r.slice(3)}」までの方` : `認知症が「${r}」の方`);
    }
  }
  const yesMedical = MEDICAL_CARE.filter((m) => acc.medical[m.id] === "both" || acc.medical[m.id] === "day");
  if (yesMedical.length > 0) out.yes.push(`医療的ケアが必要な方（${MEDICAL_CARE.length}項目中${yesMedical.length}項目）`);
  for (const m of MEDICAL_CARE) {
    const c = acc.medical[m.id];
    if (c === "no") out.no.push(`${m.label}が必要な方`);
    else if (c === "review") out.review.push(`${m.label}が必要な方`);
    else if (c === "day") out.no.push(`夜間の${m.label}が必要な方`);
  }
  const states: [Accept, string][] = [
    [acc.acceptsBedridden, "寝たきりの方"],
    [acc.acceptsWandering, "徘徊のある方"],
    [acc.acceptsAggression, "暴言・暴力のある方"],
  ];
  for (const [a, l] of states) out[a].push(l);
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

const ACCEPT_OPTIONS: { value: Accept; label: string; tone?: "review" | "no" }[] = [
  { value: "yes", label: "受け入れる" },
  { value: "review", label: "検討", tone: "review" },
  { value: "no", label: "受け入れない", tone: "no" },
];

/** 受け入れる / 検討 / 受け入れない */
function Tri({ label, value, onChange }: { label: string; value: Accept; onChange: (v: Accept) => void }) {
  return <Segmented<Accept> label={label} value={value} onChange={onChange} options={ACCEPT_OPTIONS} />;
}

/** 要介護度・認知症の段階ごとに、受け入れる / 検討 / 受け入れない を選ぶ */
function LevelTable<K extends number>({
  title,
  labels,
  value,
  onChange,
}: {
  title: string;
  labels: Record<K, string>;
  value: Record<K, Accept>;
  onChange: (v: Record<K, Accept>) => void;
}) {
  const keys = (Object.keys(labels).map(Number) as K[]).sort((a, b) => a - b);
  return (
    <div className="border-b border-line py-3 last:border-0">
      <p className="mb-2 text-[15px] font-bold">{title}</p>
      <div className="space-y-1.5">
        {keys.map((k) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-paper py-1 pr-1 pl-4">
            <span className="text-[14px] font-semibold">{labels[k]}</span>
            <Tri label={`${title}：${labels[k]}`} value={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 人数に上限があるケアの一覧と、追加・削除 */
function CapacityEditor({ acc, onChange }: { acc: Acceptance; onChange: (c: CareCapacities) => void }) {
  const entries = MEDICAL_CARE.filter((m) => acc.capacity[m.id]);
  const addable = MEDICAL_CARE.filter((m) => !acc.capacity[m.id] && acc.medical[m.id] !== "no");
  const set = (id: MedicalCareId, c: CareCapacity | null) => {
    const next = { ...acc.capacity };
    if (c) next[id] = c;
    else delete next[id];
    onChange(next);
  };
  return (
    <div>
      {entries.length === 0 && <p className="mb-3 text-[14px] text-ink-soft">いまは人数の上限を設けていません。</p>}
      {entries.map((m) => {
        const c = acc.capacity[m.id]!;
        const full = c.limit > 0 && c.current >= c.limit;
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3 last:border-0">
            <p className="min-w-0 flex-1 text-[15px] font-bold">
              {m.label}
              {full && <span className="ml-2 rounded-full bg-alert-soft px-2 py-0.5 text-[12px] text-alert">枠がいっぱい</span>}
            </p>
            <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[14px]">
              上限
              <Input
                type="number"
                min={0}
                style={{ width: "5.5rem" }}
                value={c.limit}
                onChange={(e) => set(m.id, { ...c, limit: Math.max(0, Number(e.target.value) || 0) })}
              />
              名
            </label>
            <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[14px]">
              いま
              <Input
                type="number"
                min={0}
                style={{ width: "5.5rem" }}
                value={c.current}
                onChange={(e) => set(m.id, { ...c, current: Math.max(0, Number(e.target.value) || 0) })}
              />
              名
            </label>
            <Button variant="danger" className="min-h-9 px-3 text-[13px]" onClick={() => set(m.id, null)}>
              外す
            </Button>
          </div>
        );
      })}
      {addable.length > 0 && (
        <Select
          aria-label="上限を設けるケアを追加"
          className="mt-3 w-auto"
          value=""
          onChange={(e) => e.target.value && set(e.target.value as MedicalCareId, { limit: 5, current: 0 })}
        >
          <option value="">＋ 上限を設けるケアを追加</option>
          {addable.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      )}
    </div>
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
  const summary = summarize(acc);
  const strictness = strictnessOf(s.thresholds);

  return (
    <div className={cx("max-w-3xl", dirty && isAdmin && "pb-28")}>
      <h1 className="mb-1 text-[24px] font-bold">受け入れ設定</h1>
      <p className="mb-6 text-[14px] text-ink-soft">
        施設で受け入れられる方の範囲を決めます。「受け入れない」にした項目に当てはまる方は判定が D（2つ以上なら E）、「検討」にした項目に当てはまる方は C（施設内で検討）になります。
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

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["yes", "受け入れる方", "border-grade-a/30 bg-sheet", "text-grade-a"],
            ["review", "検討する方（判定は C）", "border-grade-c/30 bg-sheet", "text-grade-c"],
            ["no", "受け入れていない方", "border-line bg-paper", "text-ink-soft"],
          ] as const
        ).map(([k, title, box, head]) => (
          <div key={k} className={cx("rounded-3xl border-2 p-4", box)}>
            <h2 className={cx("text-[15px] font-bold", head)}>{title}</h2>
            {summary[k].length === 0 ? (
              <p className="mt-1 text-[13px] text-mute">{k === "no" ? "受け入れの制限はありません" : "なし"}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-[13px] leading-snug">
                {summary[k].map((x) => (
                  <li key={x} className="flex gap-1.5">
                    <span aria-hidden className={head}>
                      {k === "yes" ? "◯" : k === "review" ? "△" : "×"}
                    </span>
                    {x}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <fieldset disabled={!isAdmin} className="space-y-6">
        <Card title="施設の名前と連絡先">
          <Field label="施設名" hint="家族アンケートの画面や、同意書の文案に表示されます。">
            <Input value={s.facilityName} maxLength={100} onChange={(e) => setAll({ facilityName: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ご家族向けの窓口" hint="アンケートの案内（印刷用）に載ります">
              <Input value={s.contactDesk} maxLength={50} placeholder="例：入居相談窓口" onChange={(e) => setAll({ contactDesk: e.target.value })} />
            </Field>
            <Field label="窓口の電話番号">
              <Input type="tel" value={s.contactPhone} maxLength={30} placeholder="例：03-1234-5678" onChange={(e) => setAll({ contactPhone: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card title="看護師と医療的ケア" note="受け入れられない医療的ケアが必要な方は、判定が D（2つ以上なら E）になります。">
          <Row label="看護師の配置">
            <Segmented<NurseStaffing>
              label="看護師の配置"
              value={acc.nurseStaffing}
              onChange={(v) => setAcc({ nurseStaffing: v })}
              options={[
                { value: "24h", label: "24時間常駐" },
                { value: "day", label: "日中のみ" },
                { value: "none", label: "配置なし", tone: "no" },
              ]}
            />
          </Row>
          {acc.nurseStaffing !== "24h" && (
            <p className="mb-2 rounded-2xl bg-brand-tint px-3 py-2 text-[13px]">
              夜間は看護師がいない設定です。夜間の医療的ケアは、研修を受けた介護職などで対応できる項目だけ「日中・夜間」にしてください。
            </p>
          )}
          <div className="mt-2 space-y-2">
            {MEDICAL_GROUPS.map((g) => {
              const items = MEDICAL_CARE.filter((m) => m.group === g.id);
              const accepted = items.filter((m) => acc.medical[m.id] === "both" || acc.medical[m.id] === "day").length;
              const reviewing = items.filter((m) => acc.medical[m.id] === "review").length;
              return (
                <details key={g.id} className="group rounded-2xl bg-paper">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                    <span className="text-[15px] font-bold">{g.label}</span>
                    <span className="text-[13px] text-ink-soft">
                      {items.length}項目中 <b className="text-brand-strong">{accepted}</b>項目を受け入れ
                      {reviewing > 0 && <>・{reviewing}項目を検討</>}
                      <span className="ml-2 inline-block transition-transform group-open:rotate-180" aria-hidden>
                        ▾
                      </span>
                    </span>
                  </summary>
                  <div className="px-4 pb-2">
                    {items.map((m) => (
                      <Row key={m.id} label={m.label}>
                        <Segmented<MedicalCapability>
                          label={m.label}
                          value={acc.medical[m.id]}
                          onChange={(v) => setAcc({ medical: { ...acc.medical, [m.id]: v } })}
                          options={
                            m.night
                              ? [
                                  { value: "both", label: "日中・夜間" },
                                  { value: "day", label: "日中のみ" },
                                  { value: "review", label: "検討", tone: "review" },
                                  { value: "no", label: "受け入れない", tone: "no" },
                                ]
                              : [
                                  { value: "both", label: "受け入れる" },
                                  { value: "review", label: "検討", tone: "review" },
                                  { value: "no", label: "受け入れない", tone: "no" },
                                ]
                          }
                        />
                      </Row>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </Card>

        <Card
          title="受け入れ枠（任意）"
          note="設備や職員の都合で人数に上限があるケアだけ設定します。いまの入居者数が上限に達していると、「枠がいっぱい」として判定に出ます。"
        >
          <CapacityEditor acc={acc} onChange={(capacity) => setAcc({ capacity })} />
        </Card>

        <Card title="介護度・認知症" note="段階ごとに、受け入れるか・検討するか・受け入れないかを選んでください。">
          <LevelTable<CareLevel>
            title="要介護度"
            labels={CARE_LEVEL_LABELS}
            value={acc.careLevels}
            onChange={(careLevels) => setAcc({ careLevels })}
          />
          <LevelTable<DementiaLevel>
            title="認知症の程度"
            labels={DEMENTIA_SHORT}
            value={acc.dementiaLevels}
            onChange={(dementiaLevels) => setAcc({ dementiaLevels })}
          />
          <Row label="寝たきりの方">
            <Tri label="寝たきりの方" value={acc.acceptsBedridden} onChange={(v) => setAcc({ acceptsBedridden: v })} />
          </Row>
          <Row label="徘徊のある方">
            <Tri label="徘徊のある方" value={acc.acceptsWandering} onChange={(v) => setAcc({ acceptsWandering: v })} />
          </Row>
          <Row label="暴言・暴力のある方">
            <Tri label="暴言・暴力のある方" value={acc.acceptsAggression} onChange={(v) => setAcc({ acceptsAggression: v })} />
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
