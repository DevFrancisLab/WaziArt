import { useState, type FormEvent } from "react";
import type { Review } from "../types";
import { reviewStamp } from "../reviewStamp";

export interface StoredExplanation {
  stamp: string;
  artworkId: string;
  recommendation: string;
  text: string;
  model: string;
}

interface SimpleExplanationProps {
  review: Review;
  explanation: StoredExplanation | null;
  error: string;
  pending: boolean;
  onExplain: (question: string) => void;
}

/** A requested restatement of the current MeTTa result. It does not choose that result. */
export function SimpleExplanation({ review, explanation, error, pending, onExplain, }: SimpleExplanationProps) {
  const [question, setQuestion] = useState("");
  const current =
    explanation &&
    explanation.stamp === reviewStamp(review) &&
    explanation.artworkId === review.artwork_id &&
    explanation.recommendation === review.recommendation
      ? explanation
      : null;

  function request(event?: FormEvent) {
    event?.preventDefault();
    onExplain(question.trim());
  }

  return (
    <section className="simple-explanation" aria-labelledby="simple-heading">
      <h3 id="simple-heading">Detailed reasoning</h3>
      <p>
        {review.label}. {review.status_note}
      </p>
      <form className="explain-bar" onSubmit={request}>
        <label className="hint" htmlFor="simple-question">
          Question optional
        </label>
        <input
          id="simple-question"
          value={question}
          maxLength={400}
          autoComplete="off"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Explaining…" : current || error ? "Try again" : "Explain simply"}
        </button>
      </form>
      <p className="live" aria-live="polite" hidden={!pending}>
        {pending ? "Writing a simple explanation…" : ""}
      </p>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {current ? (
        <>
          <p className="hint">Simple explanation (Qwen). This restates the MeTTa result. It is not the decision.</p>
          <p>{current.text}</p>
        </>
      ) : null}
    </section>
  );
}
