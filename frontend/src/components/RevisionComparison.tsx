import type { Revision } from "../types";

interface RevisionComparisonProps {
  revisions: Revision[];
}

export function RevisionComparison({ revisions }: RevisionComparisonProps) {
  return (
    <section aria-labelledby="revision-heading">
      <h3 id="revision-heading" tabIndex={-1}>
        What changed
      </h3>
      <p className="hint">Before and after come from the revision records stored for this artwork.</p>
      {revisions.length === 0 ? <p>No revision has been recorded for this submission yet.</p> : null}
      {revisions.map((revision) => (
        <article key={revision.revision_id} className="change">
          <h4>{revision.latest ? `${revision.revision_id} (latest)` : revision.revision_id}</h4>
          <p>{revision.summary}</p>
          <p>
            <span className="before">{revision.before_label}</span>
            <span aria-hidden="true"> → </span>
            <span className="after">{revision.after_label}</span>
          </p>
          <p>
            <code>{revision.before}</code> to <code>{revision.after}</code>
          </p>
          <div className="expr">{revision.expr}</div>
        </article>
      ))}
    </section>
  );
}
