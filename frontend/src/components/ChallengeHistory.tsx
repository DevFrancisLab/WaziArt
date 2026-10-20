import type { ChallengeRecord, HistoryFact } from "../types";

interface ChallengeHistoryProps {
  challenges: ChallengeRecord[];
  history: HistoryFact[];
}

function shownValue(factId: string, value: string | null): string {
  if (factId === "none") return "Not supplied";
  if (value === null || value === "") return `Stored as ${factId}`;
  return value;
}

/** Challenge notes and every stored fact, including facts a correction superseded. */
export function ChallengeHistory({ challenges, history }: ChallengeHistoryProps) {
  return (
    <section aria-labelledby="history-heading">
      <h3 id="history-heading">Challenges and stored facts</h3>
      <p className="hint">
        A challenge records the action and the fact identifiers. Superseded facts stay in the history returned by
        MeTTa. They are not the current recommendation.
      </p>
      {challenges.length === 0 ? <p>No challenge has been recorded for this submission yet.</p> : null}
      <ol className="challenges">
        {challenges.map((challenge) => (
          <li key={challenge.challenge_id}>
            <h4>
              {challenge.challenge_id}: {challenge.action}
            </h4>
            <p>
              Previous value: {shownValue(challenge.previous_fact, challenge.previous_value)}{" "}
              <span className="hint">({challenge.previous_fact})</span>
            </p>
            <p>
              {challenge.action === "dispute" ? "Disputed fact" : "Corrected value"}:{" "}
              {challenge.action === "dispute"
                ? shownValue(challenge.previous_fact, challenge.previous_value)
                : shownValue(challenge.new_fact, challenge.new_value)}{" "}
              <span className="hint">({challenge.action === "dispute" ? challenge.previous_fact : challenge.new_fact})</span>
            </p>
            <p>{challenge.note ? `Note: ${challenge.note}` : "No note was stored with this challenge."}</p>
            <div className="expr">{challenge.expr}</div>
          </li>
        ))}
      </ol>
      <h4>All stored facts</h4>
      {history.length === 0 ? <p>No stored facts were returned.</p> : null}
      <ul className="history">
        {history.map((fact) => (
          <li key={fact.fact_id}>
            <span className={`pill status-${fact.status}`}>{fact.status}</span>
            <span>
              {fact.evidence_id ? `${fact.role} ${fact.evidence_id}` : fact.role}: {fact.value}
            </span>
            <span className="hint">{fact.fact_id}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
