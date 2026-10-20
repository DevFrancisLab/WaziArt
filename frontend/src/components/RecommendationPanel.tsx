import type { Review, Vocabulary } from "../types";

/**
 * Ordinary-language meanings of the three recommendation symbols.
 * Which symbol applies is taken from the review payload, never chosen here.
 */
const STATE_COPY: Record<string, string> = {
  recommend_for_review: "The required facts align. A person should review the work.",
  request_information: "Something required was not supplied.",
  human_review: "A fact is disputed, or the supplied facts do not clearly align.",
};

interface RecommendationPanelProps {
  review: Review;
  vocabulary: Vocabulary | null;
}

export function RecommendationPanel({ review, vocabulary }: RecommendationPanelProps) {
  const symbols = vocabulary?.recommendations ?? [];
  const descriptionNote = review.trace.find((item) => item.summary.toLowerCase().includes("not interpreted"));

  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading" tabIndex={-1}>
        Review
      </h2>
      <p className={`status state-${review.recommendation}`}>
        <span className="status-label">{review.label}</span>{" "}
        <code>{review.recommendation}</code>
        <span className="status-note">{review.status_note}</span>
      </p>
      <p>{review.disclaimer}</p>
      {symbols.length > 0 ? (
        <>
          <h3>What the three recommendations mean</h3>
          <ul className="states">
            {symbols.map((symbol) => (
              <li key={symbol} aria-current={symbol === review.recommendation ? "true" : undefined}>
                <code>{symbol}</code>
                <span>{STATE_COPY[symbol] ?? "Returned by the review service."}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3>What was submitted</h3>
      <p className="hint">These are the current stored facts. Inferred results are in the trace below.</p>
      {review.records.length === 0 ? <p>No field has been supplied yet.</p> : null}
      <dl className="facts">
        {review.records.map((record) => (
          <div key={record.fact_id}>
            <dt>{record.evidence_id ? `${record.role} ${record.evidence_id}` : record.role}</dt>
            <dd>
              {record.value}
              {record.role === "description" && descriptionNote ? (
                <span className="hint"> {descriptionNote.summary}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
