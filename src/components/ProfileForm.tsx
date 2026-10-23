"use client";
import {
  CARE_LEVEL_LABELS,
  DEMENTIA_LABELS,
  MEDICAL_ITEM_LABELS,
  MOBILITY_LABELS,
  type CareLevel,
  type DementiaLevel,
  type Mobility,
  type ResidentProfile,
  type SuctionNeed,
} from "@/lib/domain/types";
import { Check, Field, Input, Select, Textarea } from "./ui";

const SUCTION_LABELS: Record<SuctionNeed, string> = {
  none: "不要",
  day: "日中のみ必要",
  night: "夜間に必要",
  both: "日中・夜間とも必要",
};

type MedicalKey = keyof typeof MEDICAL_ITEM_LABELS;

export function ProfileForm({
  value,
  onChange,
}: {
  value: ResidentProfile;
  onChange: (p: ResidentProfile) => void;
}) {
  const set = (patch: Partial<ResidentProfile>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="年齢">
          <Input
            type="number"
            min={0}
            max={130}
            value={value.age ?? ""}
            onChange={(e) => set({ age: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <Field label="要介護度">
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
        <legend className="mb-2 text-[15px] font-bold">医療的ケア</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="たん吸引">
            <Select
              value={value.medical.suction}
              onChange={(e) => set({ medical: { ...value.medical, suction: e.target.value as SuctionNeed } })}
            >
              {Object.entries(SUCTION_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {(Object.keys(MEDICAL_ITEM_LABELS) as MedicalKey[]).map((k) => (
            <Check
              key={k}
              label={MEDICAL_ITEM_LABELS[k]}
              checked={value.medical[k]}
              onChange={(v) => set({ medical: { ...value.medical, [k]: v } })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[15px] font-bold">身体・転倒</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="移動の状態">
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
          <Field label="直近1年の転倒回数">
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
        <Field label="認知症の程度">
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
