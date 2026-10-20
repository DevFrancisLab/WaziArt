import type { Review } from "../types";

interface RecommendationPanelProps {
  review: Review;
}

/** The label and note come from the review payload. This component does not choose them. */
export function RecommendationPanel({ review }: RecommendationPanelProps) {
  const title = review.records.find((record) => record.role === "title")?.value || review.artwork_id;
  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading" tabIndex={-1}>
        {title}
      </h2>
      <p className={`status state-${review.recommendation}`} role="status">
        <span className="status-label">{review.label}</span>
      </p>
      {review.status_note ? <p>{review.status_note}</p> : null}
      <p className="hint">A next step for a person. Not an acceptance or rejection.</p>
    </section>
  );
}
