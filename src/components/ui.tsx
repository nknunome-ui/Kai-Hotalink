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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-indigo text-white hover:bg-indigo-deep",
        variant === "quiet" && "border border-line bg-sheet text-ink hover:border-ink-soft",
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
  "w-full rounded-md border border-line bg-sheet px-3 py-2 text-[15px] text-ink placeholder:text-mute focus:border-indigo focus:outline-none";

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
          className="size-[18px] accent-indigo"
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
        "mb-5 scroll-mt-6 rounded-lg border bg-sheet p-5 sm:p-6",
        current ? "border-indigo shadow-[0_0_0_3px_var(--color-glow-soft)]" : "border-line",
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
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold leading-none",
        done ? "bg-grade-a text-white" : current ? "bg-indigo text-white" : "border border-line text-mute",
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
        "rounded-md px-4 py-3 text-[14px]",
        tone === "alert" ? "bg-alert-soft text-alert" : "bg-glow-soft text-ink",
      )}
    >
      {children}
    </div>
  );
}

export { cx };
