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

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
    </label>
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
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[15px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-[18px] accent-indigo"
      />
      {label}
    </label>
  );
}

/** 入居者ページの手順。実際に順番がある作業なので番号を振る。 */
export function Step({
  n,
  title,
  status,
  children,
}: {
  n: number;
  title: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6 pb-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mincho text-[22px] leading-none text-indigo">{n}</span>
        <h2 className="text-[18px] font-bold">{title}</h2>
        {status && <span className="text-[13px] text-mute">{status}</span>}
      </div>
      {children}
    </section>
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
