"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "quiet" | "danger";

export function Button({
  variant = "primary",
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand-strong text-white shadow-[0_2px_0_var(--color-brand-deep)] hover:bg-brand-deep active:translate-y-px active:shadow-none",
        variant === "quiet" && "border-2 border-brand-soft bg-sheet text-brand-strong hover:border-brand hover:bg-brand-tint",
        variant === "danger" && "text-alert hover:bg-alert-soft",
        className,
      )}
    >
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  note,
  children,
}: {
  label: string;
  hint?: string;
  /** 入力欄の下に出す補足（AI の根拠など） */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-ink-soft">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
      </label>
      {note}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-line bg-sheet px-3 py-2 text-[15px] text-ink placeholder:text-mute/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-tint";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, "min-h-11", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "leading-relaxed", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "min-h-11", props.className)} />;
}

export function Check({
  label,
  checked,
  onChange,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  note?: ReactNode;
}) {
  return (
    <div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-5 accent-brand-strong"
        />
        {label}
      </label>
      {note && <div className="pl-7">{note}</div>}
    </div>
  );
}

/** 入居者ページの手順。実際に順番がある作業なので番号を振る。 */
export function Step({
  id,
  n,
  title,
  status,
  done,
  current,
  children,
}: {
  id?: string;
  n: number;
  title: string;
  status?: ReactNode;
  done?: boolean;
  /** 次にやることがこの手順にある */
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cx(
        "mb-5 scroll-mt-6 rounded-3xl border-2 bg-sheet p-5 shadow-card sm:p-6",
        current ? "border-brand" : "border-transparent",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StepBadge n={n} done={done} current={current} />
        <h2 className="text-[18px] font-bold">{title}</h2>
        {status && <span className="text-[13px] text-mute">{status}</span>}
      </div>
      {children}
    </section>
  );
}

export function StepBadge({ n, done, current }: { n: number; done?: boolean; current?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none",
        done ? "bg-grade-a text-white" : current ? "bg-brand-strong text-white" : "bg-brand-tint text-brand-strong",
      )}
      aria-label={done ? `手順${n}・完了` : `手順${n}`}
    >
      {done ? "✓" : n}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "alert"; children: ReactNode }) {
  return (
    <div
      role={tone === "alert" ? "alert" : "status"}
      className={cx(
        "rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
        tone === "alert" ? "bg-alert-soft text-alert" : "border border-brand-soft bg-brand-tint text-ink",
      )}
    >
      {children}
    </div>
  );
}

/** 選択肢から1つを選ぶボタンの並び（「受け入れる / 受け入れない」など） */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  /** 読み上げ用のラベル */
  label: string;
  value: T;
  options: { value: T; label: string; tone?: "yes" | "no" }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-paper p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-h-9 rounded-full px-4 text-[14px] font-bold transition-colors disabled:cursor-not-allowed",
              !on && "text-ink-soft hover:bg-sheet hover:text-ink",
              on && o.tone === "no" && "bg-ink-soft text-white",
              on && o.tone !== "no" && "bg-brand-strong text-white",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** ロゴ: ほたるの光をイメージした丸いマークと名前 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className={lg ? "size-10" : "size-7"} aria-hidden>
        <circle cx="16" cy="16" r="15" fill="var(--color-brand-soft)" />
        <circle cx="16" cy="16" r="9" fill="var(--color-brand)" />
        <circle cx="13" cy="13" r="3" fill="#fff" opacity="0.85" />
      </svg>
      <span className={cx("font-bold tracking-wide text-brand-strong", lg ? "text-[32px]" : "text-[22px]")}>Hotalink</span>
    </span>
  );
}

export { cx };
