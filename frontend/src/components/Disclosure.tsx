import type { ReactNode } from "react";

interface DisclosureProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  summaryId?: string;
}

/** A native disclosure. The summary is a button for keyboard and assistive technology. */
export function Disclosure({ title, open, onOpenChange, children, summaryId }: DisclosureProps) {
  return (
    <details
      className="disclosure"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) onOpenChange(next);
      }}
    >
      <summary id={summaryId}>{title}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
