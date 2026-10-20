import type { SectionKey } from "../conversation";
import type { ChallengeBody, Review, Vocabulary } from "../types";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengeHistory } from "./ChallengeHistory";
import { Disclosure } from "./Disclosure";
import { ReasoningGraph } from "./ReasoningGraph";
import { ReasoningTrace } from "./ReasoningTrace";
import { RevisionComparison } from "./RevisionComparison";
import { SimpleExplanation, type StoredExplanation } from "./SimpleExplanation";

interface ReviewDeskProps {
  review: Review;
  vocabulary: Vocabulary | null;
  busy: boolean;
  sections: Record<SectionKey, boolean>;
  onSection: (key: SectionKey, open: boolean) => void;
  onChallenge: (body: ChallengeBody) => Promise<void>;
  explanation: StoredExplanation | null;
  explanationError: string;
  explaining: boolean;
  onExplain: (question: string) => void;
}

function rulesFrom(review: ReviewDeskProps["review"]) {
  const names: string[] = [];
  for (const item of review.trace) {
    if (item.rule && !names.includes(item.rule)) names.push(item.rule);
  }
  return names;
}

export function ReviewDesk({
  review,
  vocabulary,
  busy,
  sections,
  onSection,
  onChallenge,
  explanation,
  explanationError,
  explaining,
  onExplain,
}: ReviewDeskProps) {
  const rules = rulesFrom(review);
  return (
    <article className="review-details">
      <SimpleExplanation
        review={review}
        explanation={explanation}
        error={explanationError}
        pending={explaining}
        onExplain={onExplain}
      />
      {rules.length > 0 ? (
        <details className="disclosure">
          <summary>Rule explanation</summary>
          <p className="hint">Rules named by the returned trace.</p>
          <ul className="rule-notes">
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      ) : null}
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
          <summary>Facts</summary>
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
