import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import "./checkbox.css";

type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "children"
> & {
  children: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
};

/** Native form semantics with one shared marker, caption and hit area. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      children,
      description,
      indeterminate = false,
      className = "",
      onKeyDown,
      checked,
      ...props
    },
    ref,
  ) {
    const id = useId(),
      input = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => input.current!, []);
    useEffect(() => {
      if (input.current) input.current.indeterminate = indeterminate;
    }, [indeterminate, checked]);

    return (
      <label className={`ui-checkbox ${className}`}>
        <input
          {...props}
          ref={input}
          type="checkbox"
          checked={checked}
          className="ui-checkbox__input"
          aria-labelledby={
            props["aria-labelledby"] ??
            (props["aria-label"] ? undefined : `${id}-caption`)
          }
          aria-describedby={
            [props["aria-describedby"], description ? `${id}-description` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            if (event.key === "Enter") {
              event.preventDefault();
              if (!event.repeat) event.currentTarget.click();
            }
            if (
              ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(
                event.key,
              )
            ) {
              const group = event.currentTarget.closest("fieldset");
              if (!group) return;
              const items = Array.from(
                group.querySelectorAll<HTMLInputElement>(
                  ".ui-checkbox__input:not(:disabled)",
                ),
              ).filter((item) => item.closest("fieldset") === group);
              const direction = ["ArrowDown", "ArrowRight"].includes(event.key)
                ? 1
                : -1;
              const index = items.indexOf(event.currentTarget);
              if (index >= 0 && items.length > 1) {
                event.preventDefault();
                items[
                  (index + direction + items.length) % items.length
                ].focus();
              }
            }
          }}
        />
        <span className="ui-checkbox__mark" aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false">
            <path d="m3.5 8 3 3 6-6" />
          </svg>
          <span className="ui-checkbox__mixed" />
        </span>
        <span className="ui-checkbox__body">
          <span id={`${id}-caption`} className="ui-checkbox__caption">
            {children}
          </span>
          {description && (
            <span id={`${id}-description`} className="ui-checkbox__description">
              {description}
            </span>
          )}
        </span>
      </label>
    );
  },
);
