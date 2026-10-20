import type { Review } from "./types";

/** Changes when the artwork, its facts, or its recommendation change. */
export function reviewStamp(review: Review): string {
  const facts = review.records.map((item) => `${item.fact_id}:${item.role}:${item.value}`).join("|");
  const latest = review.revisions.find((item) => item.latest)?.revision_id ?? "";
  return `${review.artwork_id}:${review.recommendation}:${latest}:${review.challenges.length}:${facts}`;
}
