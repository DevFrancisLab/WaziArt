import { useState, type FormEvent } from "react";
import type { EvidenceDraft, SubmissionBody, Vocabulary } from "../types";

const SYMBOL = /^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/;

interface ArtworkSubmissionFormProps {
  vocabulary: Vocabulary | null;
  busy: boolean;
  onSubmit: (body: SubmissionBody) => Promise<void>;
}

interface EvidenceRow extends EvidenceDraft {
  key: string;
  other: string;
}

let rowKey = 0;

function nextKey(): string {
  rowKey += 1;
  return `evidence-${rowKey}`;
}

/**
 * Collects structured fields. The description is sent as text.
 * Evidence is only the concept the artist selects.
 */
export function ArtworkSubmissionForm({ vocabulary, busy, onSubmit }: ArtworkSubmissionFormProps) {
  const [artworkId, setArtworkId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [themeChoice, setThemeChoice] = useState("");
  const [themeOther, setThemeOther] = useState("");
  const [permission, setPermission] = useState("");
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [error, setError] = useState("");

  function fill(sample: "gap" | "ready" | "dispute") {
    const theme = vocabulary?.exhibition_theme ?? "peace";
    const concept = vocabulary?.concepts.includes("reconciliation")
      ? "reconciliation"
      : (vocabulary?.concepts[0] ?? "");
    setArtworkId(sample === "gap" ? "paths-to-peace" : sample === "ready" ? "ready-work" : "disputed-memorial");
    setTitle(sample === "dispute" ? "Disputed Memorial" : "Paths to Peace");
    setDescription(
      sample === "dispute"
        ? "A shared wall lists names the two communities do not yet agree how to read."
        : "Figures meet (and listen) beside a paper river.",
    );
    setThemeChoice(theme);
    setThemeOther("");
    setPermission(sample === "ready" ? "confirmed" : sample === "dispute" ? "disputed" : "");
    setRows(
      concept
        ? [{ key: nextKey(), concept, note: "The boats meet in the middle of the corridor.", other: "" }]
        : [],
    );
    setError("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    const theme = themeChoice === "other" ? themeOther.trim().toLowerCase() : themeChoice;
    const evidence = rows.map((row) => ({
      concept: row.concept === "other" ? row.other.trim().toLowerCase() : row.concept,
      note: row.note.trim(),
    }));
    try {
      await onSubmit({
        artwork_id: artworkId.trim() || undefined,
        title: title.trim(),
        description: description.trim(),
        theme,
        permission,
        evidence,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The submission could not be sent.");
    }
  }

  function validate(): string {
    if (artworkId.trim() && !SYMBOL.test(artworkId.trim().toLowerCase())) {
      return "The identifier must be a short lowercase token such as paths-to-peace.";
    }
    if (themeChoice === "other" && !SYMBOL.test(themeOther.trim().toLowerCase())) {
      return "The other theme must be a short lowercase token such as peace.";
    }
    for (const row of rows) {
      const concept = row.concept === "other" ? row.other.trim().toLowerCase() : row.concept;
      if (!concept) return "Choose a concept for each evidence row, or remove the row.";
      if (!SYMBOL.test(concept)) return "An evidence concept must be a short lowercase token such as dialogue.";
    }
    return "";
  }

  const concepts = vocabulary?.concepts ?? [];
  const permissions = vocabulary?.permissions ?? [];
  const theme = vocabulary?.exhibition_theme;

  return (
    <section aria-labelledby="submission">
      <h2 id="submission">Submit artwork</h2>
      <p className="hint">
        Leave a field blank when it was not supplied. The description is stored as text. Choose an evidence concept
        separately. The paragraph is not read as evidence.
      </p>
      <div className="samples">
        <p id="samples-heading" className="samples-label">
          Demo shortcuts
        </p>
        <p className="hint">These fill the form. Nothing is reviewed until you submit it.</p>
        <div className="row" role="group" aria-labelledby="samples-heading">
          <button type="button" onClick={() => fill("gap")}>
            Fill: permission not supplied
          </button>
          <button type="button" onClick={() => fill("ready")} disabled={!vocabulary}>
            Fill: ready for review
          </button>
          <button type="button" onClick={() => fill("dispute")} disabled={!vocabulary}>
            Fill: disputed permission
          </button>
        </div>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="artwork-id">
            Identifier <span className="hint">optional, such as paths-to-peace</span>
          </label>
          <input
            id="artwork-id"
            name="artwork_id"
            value={artworkId}
            autoComplete="off"
            onChange={(event) => setArtworkId(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            value={title}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={description}
            maxLength={2000}
            rows={4}
            aria-describedby="description-hint"
            onChange={(event) => setDescription(event.target.value)}
          />
          <p id="description-hint" className="hint">
            Stored as text. WaziArt does not infer evidence from this paragraph.
          </p>
        </div>
        <div className="field">
          <label htmlFor="theme">Exhibition theme</label>
          <select
            id="theme"
            name="theme"
            value={themeChoice}
            onChange={(event) => setThemeChoice(event.target.value)}
          >
            <option value="">Not supplied</option>
            {theme ? <option value={theme}>{theme}</option> : null}
            <option value="other">Other token</option>
          </select>
        </div>
        {themeChoice === "other" ? (
          <div className="field">
            <label htmlFor="theme-other">Other theme token</label>
            <input
              id="theme-other"
              value={themeOther}
              autoComplete="off"
              onChange={(event) => setThemeOther(event.target.value)}
            />
          </div>
        ) : null}
        <fieldset>
          <legend>Permission to exhibit</legend>
          <div className="choices">
            <label>
              <input
                type="radio"
                name="permission"
                value=""
                checked={permission === ""}
                onChange={() => setPermission("")}
              />
              Not supplied
            </label>
            {permissions.map((status) => (
              <label key={status}>
                <input
                  type="radio"
                  name="permission"
                  value={status}
                  checked={permission === status}
                  onChange={() => setPermission(status)}
                />
                {status}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Evidence concepts</legend>
          {rows.length === 0 ? <p className="hint">No evidence concept has been added.</p> : null}
          {rows.map((row) => (
            <div className="evidence-row" key={row.key}>
              <div className="field">
                <label htmlFor={`${row.key}-concept`}>Evidence concept</label>
                <select
                  id={`${row.key}-concept`}
                  value={row.concept}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) => (item.key === row.key ? { ...item, concept: event.target.value } : item)),
                    )
                  }
                >
                  <option value="">Not supplied</option>
                  {concepts.map((concept) => (
                    <option key={concept} value={concept}>
                      {concept}
                    </option>
                  ))}
                  <option value="other">Other token</option>
                </select>
              </div>
              {row.concept === "other" ? (
                <div className="field">
                  <label htmlFor={`${row.key}-other`}>Other evidence concept</label>
                  <input
                    id={`${row.key}-other`}
                    value={row.other}
                    autoComplete="off"
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.key === row.key ? { ...item, other: event.target.value } : item)),
                      )
                    }
                  />
                </div>
              ) : null}
              <div className="field">
                <label htmlFor={`${row.key}-note`}>Note for this evidence</label>
                <input
                  id={`${row.key}-note`}
                  value={row.note}
                  maxLength={500}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) => (item.key === row.key ? { ...item, note: event.target.value } : item)),
                    )
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                Remove evidence
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { key: nextKey(), concept: "", note: "", other: "" }])}
          >
            Add evidence
          </button>
        </fieldset>
        {error ? (
          <p className="alert" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || !vocabulary}>
          {busy ? "Asking MeTTa…" : "Submit for review"}
        </button>
      </form>
    </section>
  );
}
