import type { SectionKey } from "../conversation";
import type { ChallengeBody, Review, Vocabulary } from "../types";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengeHistory } from "./ChallengeHistory";
import { Disclosure } from "./Disclosure";
import { ReasoningGraph } from "./ReasoningGraph";
import { ReasoningTrace } from "./ReasoningTrace";
import { RevisionComparison } from "./RevisionComparison";

interface ReviewDeskProps {
  review: Review;
  vocabulary: Vocabulary | null;
  busy: boolean;
  sections: Record<SectionKey, boolean>;
  onSection: (key: SectionKey, open: boolean) => void;
  onChallenge: (body: ChallengeBody) => Promise<void>;
}

export function ReviewDesk({ review, vocabulary, busy, sections, onSection, onChallenge }: ReviewDeskProps) {
  return (
    <article className="review-details">
      {review.trace.length > 0 ? (
        <Disclosure title="Reasoning trace" open={sections.trace} onOpenChange={(open) => onSection("trace", open)}>
          <ReasoningTrace trace={review.trace} />
        </Disclosure>
      ) : null}
      {review.edges.length > 0 ? (
        <Disclosure title="Relationships" open={sections.graph} onOpenChange={(open) => onSection("graph", open)}>
          <ReasoningGraph edges={review.edges} />
        </Disclosure>
      ) : null}
      {review.revisions.length > 0 ? (
        <Disclosure title="What changed" open={sections.revision} onOpenChange={(open) => onSection("revision", open)}>
          <RevisionComparison revisions={review.revisions} />
        </Disclosure>
      ) : null}
      {review.challenges.length > 0 ? (
        <Disclosure title="History" open={sections.history} onOpenChange={(open) => onSection("history", open)}>
          <ChallengeHistory challenges={review.challenges} history={review.history} />
        </Disclosure>
      ) : null}
      {review.records.length > 0 ? (
        <details className="disclosure">
          <summary>Matched facts</summary>
          <dl className="facts">
            {review.records.map((record) => (
              <div key={record.fact_id}>
                <dt>{record.role}</dt>
                <dd>{record.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <ChallengeForm
        key={`${review.artwork_id}-${review.challenges.length}-${review.recommendation}`}
        review={review}
        vocabulary={vocabulary}
        busy={busy}
        onSubmit={onChallenge}
      />
    </article>
  );
}
