import type { TraceItem } from "../types";

interface ReasoningTraceProps {
  trace: TraceItem[];
}

export function ReasoningTrace({ trace }: ReasoningTraceProps) {
  return (
    <section>
      <ol className="trace">
        {trace.map((item) => (
          <li key={item.expr}>
            <span className="kind">{item.kind || "inferred"}</span>
            <span>{item.summary}</span>
            <div className="expr">{item.expr}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
