import type { TraceItem } from "../types";

interface ReasoningTraceProps {
  trace: TraceItem[];
}

export function ReasoningTrace({ trace }: ReasoningTraceProps) {
  return (
    <section aria-labelledby="trace-heading">
      <h3 id="trace-heading">Why this recommendation</h3>
      <p className="hint">Each item is a MeTTa trace result. The sentence is a reading of that expression.</p>
      {trace.length === 0 ? <p>No trace items were returned for this review.</p> : null}
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
