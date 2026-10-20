import { useState, type FormEvent } from "react";
import type { ChallengeBody, Review, Vocabulary } from "../types";

const SYMBOL = /^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/;

interface ChallengeFormProps {
  review: Review;
  vocabulary: Vocabulary | null;
  busy: boolean;
  onSubmit: (body: ChallengeBody) => Promise<void>;
}

interface Target {
  value: string;
  label: string;
  role: string;
  evidenceId: string;
}

function targetsFor(review: Review): Target[] {
  const items: Target[] = [];
  for (const role of ["title", "description", "theme", "permission"]) {
    const record = review.records.find((item) => item.role === role);
    if (record) {
      items.push({
        value: `${role}|${record.fact_id}`,
        label: `${role}: ${record.value}`,
        role,
        evidenceId: "",
      });
    } else {
      items.push({ value: `${role}|`, label: `${role} (not supplied yet)`, role, evidenceId: "" });
    }
  }
  review.records
    .filter((record) => record.role === "evidence" && record.evidence_id)
    .forEach((record) => {
      items.push({
        value: `evidence|${record.evidence_id}`,
        label: `evidence ${record.evidence_id}: ${record.value}`,
        role: "evidence",
        evidenceId: record.evidence_id ?? "",
      });
    });
  items.push({ value: "evidence|", label: "Add an evidence concept", role: "evidence", evidenceId: "" });
  return items;
}

/** Sends a correct or dispute request. The next recommendation comes back from the API. */
export function ChallengeForm({ review, vocabulary, busy, onSubmit }: ChallengeFormProps) {
  const targets = targetsFor(review);
  const [target, setTarget] = useState(targets[0]?.value ?? "permission|");
  const [action, setAction] = useState<"correct" | "dispute">("correct");
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const selected = targets.find((item) => item.value === target) ?? targets[0];
  const role = selected?.role ?? "permission";
  const useSelect = role === "permission" || role === "theme" || role === "evidence";
  const showOther = useSelect && choice === "other";
  const correctedId = showOther || !useSelect ? "corrected-input" : "corrected-select";

  const selectOptions =
    role === "permission"
      ? (vocabulary?.permissions ?? ["confirmed", "missing", "disputed"])
      : role === "theme"
        ? [vocabulary?.exhibition_theme].filter((item): item is string => Boolean(item))
        : (vocabulary?.concepts ?? []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setError("Choose a fact to challenge.");
      return;
    }
    let value = "";
    if (action === "correct") {
      value = useSelect ? (choice === "other" ? other.trim().toLowerCase() : choice) : text.trim();
      if (!value) {
        setError("Enter the corrected value.");
        return;
      }
      if (useSelect && !SYMBOL.test(value)) {
        setError("The corrected value must be a short lowercase token.");
        return;
      }
    }
    setError("");
    try {
      await onSubmit({
        role,
        action,
        value,
        evidence_id: role === "evidence" ? selected.evidenceId : "",
        note: note.trim(),
      });
      setNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The challenge could not be sent.");
    }
  }

  return (
    <section aria-labelledby="challenge-heading">
      <h3 id="challenge-heading">Challenge or correct a fact</h3>
      <p className="hint">
        A correction keeps the previous fact and adds a new one. A dispute leaves the fact in place and marks it
        contested. MeTTa then infers the recommendation again.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="challenge-target">Fact</label>
          <select
            id="challenge-target"
            value={selected?.value ?? ""}
            onChange={(event) => {
              setTarget(event.target.value);
              setChoice("");
              setOther("");
              setText("");
            }}
          >
            {targets.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend>Action</legend>
          <div className="choices">
            <label>
              <input
                type="radio"
                name="challenge-action"
                value="correct"
                checked={action === "correct"}
                onChange={() => setAction("correct")}
              />
              Correct
            </label>
            <label>
              <input
                type="radio"
                name="challenge-action"
                value="dispute"
                checked={action === "dispute"}
                onChange={() => setAction("dispute")}
              />
              Dispute
            </label>
          </div>
        </fieldset>
        {action === "correct" ? (
          <div className="field">
            <label htmlFor={correctedId}>{role === "evidence" ? "Corrected evidence concept" : `Corrected ${role}`}</label>
            {useSelect ? (
              <select id="corrected-select" value={choice} onChange={(event) => setChoice(event.target.value)}>
                <option value="">Choose a value</option>
                {selectOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {role === "permission" ? null : <option value="other">Other token</option>}
              </select>
            ) : null}
            {!useSelect || showOther ? (
              <input
                id="corrected-input"
                value={useSelect ? other : text}
                autoComplete="off"
                maxLength={role === "title" ? 200 : 2000}
                onChange={(event) => (useSelect ? setOther(event.target.value) : setText(event.target.value))}
              />
            ) : null}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="challenge-note">
            Note <span className="hint">optional</span>
          </label>
          <textarea
            id="challenge-note"
            value={note}
            rows={3}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {error ? (
          <p className="alert" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? "Reassessing in MeTTa…" : "Record challenge and reassess"}
        </button>
      </form>
    </section>
  );
}
