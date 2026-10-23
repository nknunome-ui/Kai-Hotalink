import { GRADE_MEANINGS, type Grade } from "@/lib/domain/types";

const COLORS: Record<Grade, string> = {
  A: "var(--color-grade-a)",
  B: "var(--color-grade-b)",
  C: "var(--color-grade-c)",
  D: "var(--color-grade-d)",
  E: "var(--color-grade-e)",
};

export function gradeColor(g: Grade) {
  return COLORS[g];
}

/** 判定の灯り。判定結果の一文字を明朝で大きく灯す。 */
export function GradeLantern({ grade, size = "lg", animate }: { grade: Grade; size?: "sm" | "lg"; animate?: boolean }) {
  const color = COLORS[grade];
  if (size === "sm") {
    return (
      <span
        className="inline-flex size-9 items-center justify-center rounded-full font-mincho text-[20px] leading-none text-white"
        style={{ background: color }}
        aria-label={`判定 ${grade}：${GRADE_MEANINGS[grade].meaning}`}
      >
        {grade}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-5">
      <span
        className={`inline-flex size-24 shrink-0 items-center justify-center rounded-full font-mincho text-[56px] leading-none text-white ${animate ? "lantern" : ""}`}
        style={{ background: color, ["--glow-color" as string]: "rgba(223,232,138,0.85)" }}
        aria-hidden
      >
        {grade}
      </span>
      <div>
        <p className="text-[20px] font-bold leading-snug">{GRADE_MEANINGS[grade].meaning}</p>
        <p className="text-[14px] text-ink-soft">次の対応：{GRADE_MEANINGS[grade].next}</p>
      </div>
      <span className="sr-only">判定 {grade}</span>
    </div>
  );
}
