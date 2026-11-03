"use client";
import type { ReactNode } from "react";
import { fieldText } from "@/lib/domain/profile";
import { MEDICAL_CARE, MEDICAL_GROUPS, neededItems } from "@/lib/domain/medical";
import {
  CARE_LEVEL_LABELS,
  DEMENTIA_LABELS,
  MOBILITY_LABELS,
  type CareLevel,
  type DementiaLevel,
  type Evidence,
  type Mobility,
  type ProfileField,
  type ResidentProfile,
} from "@/lib/domain/types";
import { Check, Field, Input, Select, Textarea } from "./ui";

export function ProfileForm({
  value,
  onChange,
  ai,
  evidence = [],
}: {
  value: ResidentProfile;
  onChange: (p: ResidentProfile) => void;
  /** AI が読み取った値。あればスタッフが直した項目に印を付ける */
  ai?: ResidentProfile | null;
  /** AI が示した項目ごとの根拠 */
  evidence?: Evidence[];
}) {
  const set = (patch: Partial<ResidentProfile>) => onChange({ ...value, ...patch });
  const note = (f: ProfileField) => <FieldNote field={f} value={value} ai={ai} evidence={evidence} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="年齢" note={note("age")}>
          <Input
            type="number"
            min={0}
            max={130}
            value={value.age ?? ""}
            onChange={(e) => set({ age: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <Field label="要介護度" note={note("careLevel")}>
          <Select value={value.careLevel} onChange={(e) => set({ careLevel: Number(e.target.value) as CareLevel })}>
            {Object.entries(CARE_LEVEL_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-[15px] font-bold">医療的ケア</legend>
        <p className="mb-3 text-[13px] text-ink-soft">
          必要なケアにチェックを入れます。
          {neededItems(value.medical).length > 0 && `いま ${neededItems(value.medical).length} 項目が必要になっています。`}
          「夜間も」は、夜（20時〜6時）にもケアが必要な場合に選びます。
        </p>
        <div className="space-y-4">
          {MEDICAL_GROUPS.map((g) => (
            <div key={g.id} className="rounded-2xl bg-paper p-3">
              <p className="mb-1 text-[13px] font-bold text-ink-soft">{g.label}</p>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {MEDICAL_CARE.filter((m) => m.group === g.id).map((m) => {
                  const need = value.medical[m.id];
                  const setNeed = (v: typeof need) => set({ medical: { ...value.medical, [m.id]: v } });
                  return (
                    <Check
                      key={m.id}
                      label={m.label}
                      checked={need !== "none"}
                      onChange={(v) => setNeed(v ? "day" : "none")}
                      note={
                        <>
                          {m.night && need !== "none" && (
                            <label className="mb-1 flex cursor-pointer items-center gap-2 text-[13px] font-bold text-brand-strong">
                              <input
                                type="checkbox"
                                className="size-4 accent-brand-strong"
                                checked={need === "night"}
                                onChange={(e) => setNeed(e.target.checked ? "night" : "day")}
                              />
                              夜間も必要
                            </label>
                          )}
                          {note(m.id)}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[15px] font-bold">身体・転倒</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="移動の状態" note={note("mobility")}>
            <Select
              value={value.physical.mobility}
              onChange={(e) => set({ physical: { ...value.physical, mobility: e.target.value as Mobility } })}
            >
              {Object.entries(MOBILITY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="直近1年の転倒回数" note={note("fallsLastYear")}>
            <Input
              type="number"
              min={0}
              max={99}
              value={value.physical.fallsLastYear}
              onChange={(e) =>
                set({ physical: { ...value.physical, fallsLastYear: Math.max(0, Number(e.target.value) || 0) } })
              }
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[15px] font-bold">認知・行動</legend>
        <Field label="認知症の程度" note={note("dementiaLevel")}>
          <Select
            value={value.cognition.dementiaLevel}
            onChange={(e) =>
              set({ cognition: { ...value.cognition, dementiaLevel: Number(e.target.value) as DementiaLevel } })
            }
          >
            {Object.entries(DEMENTIA_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {(
            [
              ["wandering", "徘徊"],
              ["aggression", "暴言・暴力"],
              ["careRefusal", "介護拒否"],
              ["nightDisturbance", "昼夜逆転・夜間の不穏"],
            ] as const
          ).map(([k, l]) => (
            <Check
              key={k}
              label={l}
              checked={value.cognition[k]}
              onChange={(v) => set({ cognition: { ...value.cognition, [k]: v } })}
              note={note(k)}
            />
          ))}
        </div>
      </fieldset>

      <Field label="補足（病名・服薬・生活上の注意など）" hint="判定の点数には使いません。施設内の共有用です。">
        <Textarea rows={4} value={value.summary} onChange={(e) => set({ summary: e.target.value })} />
      </Field>
    </div>
  );
}

/** 項目の下に出す、AI の根拠とスタッフが直したかどうか */
function FieldNote({
  field,
  value,
  ai,
  evidence,
}: {
  field: ProfileField;
  value: ResidentProfile;
  ai?: ResidentProfile | null;
  evidence: Evidence[];
}) {
  const ev = evidence.find((e) => e.field === field);
  const edited = ai ? fieldText(ai, field) !== fieldText(value, field) : false;
  if (!ev && !edited) return null;
  const lines: ReactNode[] = [];
  if (edited && ai) {
    lines.push(
      <span key="edited" className="block text-[12px] font-semibold text-grade-c">
        修正済み（AIの読み取り：{fieldText(ai, field)}）
      </span>,
    );
  }
  if (ev) {
    lines.push(
      <span key="ev" className="block text-[12px] leading-snug text-ink-soft">
        <span className="mr-1 rounded bg-brand-tint px-1 font-semibold text-ink">根拠</span>「{ev.quote}」
        <span className="text-mute">— {ev.source}</span>
      </span>,
    );
  }
  return <span className="mt-1 mb-1 block space-y-0.5 pl-0.5">{lines}</span>;
}
