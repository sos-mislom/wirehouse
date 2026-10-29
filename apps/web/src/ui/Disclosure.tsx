import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "./index";

export function Disclosure({
  title,
  children,
  open = false,
  className = "",
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(open);
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    setExpanded(open);
    if (open) setMounted(true);
  }, [open]);
  return (
    <section
      className={`work-disclosure ${className}`.trim()}
      aria-labelledby={`${id}-title`}
    >
      <div className="disclosure-heading">
        <h3 id={`${id}-title`}>{title}</h3>
        <Button
          variant="secondary"
          type="button"
          className="disclosure-toggle"
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
          aria-labelledby={`${id}-action ${id}-title`}
          onClick={() => {
            setMounted(true);
            setExpanded((value) => !value);
          }}
        >
          <span id={`${id}-action`}>{expanded ? "Скрыть" : "Показать"}</span>
        </Button>
      </div>
      {(mounted || expanded) && (
        <div
          id={`${id}-body`}
          className="work-disclosure-body"
          hidden={!expanded}
        >
          {children}
        </div>
      )}
    </section>
  );
}
