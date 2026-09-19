import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import "./ui.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "text" | "plain";
  busy?: boolean;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      busy = false,
      disabled,
      children,
      className = "",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={`ui-button ui-button--${variant} ${className}`}
      >
        {children}
      </button>
    );
  },
);
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", type = "text", ...props }, ref) {
  const control = [
    "checkbox",
    "radio",
    "hidden",
    "file",
    "range",
    "color",
  ].includes(type)
    ? `ui-input--${type}`
    : "ui-control";
  return (
    <input
      {...props}
      ref={ref}
      type={type}
      className={`${control} ${className}`}
    />
  );
});
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", ...props }, ref) {
  return (
    <select
      {...props}
      ref={ref}
      className={`ui-control ui-select ${className}`}
    />
  );
});
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={`ui-control ui-textarea ${className}`}
    />
  );
});
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactNode;
}) {
  const id = useId();
  const description = error || hint;
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-describedby": description ? `${id}-hint` : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {description && (
        <small
          id={`${id}-hint`}
          className={error ? "ui-field-error" : "ui-field-hint"}
        >
          {description}
        </small>
      )}
    </div>
  );
}
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={`ui-alert ui-alert--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <h2>{title}</h2>
      {actions && <div className="ui-actions">{actions}</div>}
    </header>
  );
}
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <article {...props} className={`ui-card ${className}`} />;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <p>{title}</p>
      {children}
    </div>
  );
}
