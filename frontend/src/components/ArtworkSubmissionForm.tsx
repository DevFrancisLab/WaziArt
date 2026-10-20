import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import type { EvidenceDraft, SubmissionBody, Vocabulary } from "../types";

const SYMBOL = /^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ArtworkSubmissionFormProps {
  vocabulary: Vocabulary | null;
  busy: boolean;
  onSubmit: (body: SubmissionBody, image: File) => Promise<void>;
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
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);

  useEffect(() => {
    if (!image || typeof URL.createObjectURL !== "function") {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || busy) return;
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
    if (!image) {
      setError("Choose an artwork image before submitting.");
      return;
    }
    sending.current = true;
    try {
      await onSubmit(
        {
          artwork_id: artworkId.trim() || undefined,
          title: title.trim(),
          description: description.trim(),
          theme,
          permission,
          evidence,
        },
        image,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The submission could not be sent.");
    } finally {
      sending.current = false;
    }
  }

  function validate(): string {
    if (artworkId.trim() && !SYMBOL.test(artworkId.trim().toLowerCase())) {
      return "The identifier must be a short lowercase token.";
    }
    if (themeChoice === "other" && !SYMBOL.test(themeOther.trim().toLowerCase())) {
      return "The other theme must be a short lowercase token such as peace.";
    }
    for (const row of rows) {
      const concept = row.concept === "other" ? row.other.trim().toLowerCase() : row.concept;
      if (!concept) return "Choose a concept for each evidence row, or remove the row.";
      if (!SYMBOL.test(concept)) return "An evidence concept must be a short lowercase token such as dialogue.";
    }
    if (!image) return "Choose an artwork image before submitting.";
    return "";
  }

  function takeFile(file: File | undefined) {
    if (!file) return;
    const extension = file.name.toLowerCase();
    const typeAllowed = IMAGE_TYPES.has(file.type) || (!file.type && /\.(jpe?g|png|webp)$/.test(extension));
    if (!typeAllowed) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("The image must be 10 MB or smaller.");
      return;
    }
    if (file.size === 0) {
      setError("The image file is empty.");
      return;
    }
    setError("");
    setImage(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    takeFile(event.dataTransfer.files?.[0]);
  }

  const concepts = vocabulary?.concepts ?? [];
  const permissions = vocabulary?.permissions ?? [];
  const theme = vocabulary?.exhibition_theme;

  return (
    <section aria-labelledby="submission">
      <h2 id="submission">Upload artwork</h2>
      <form aria-labelledby="submission" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="artwork-image">Artwork image</label>
          <p id="image-hint" className="hint">
            JPEG, PNG, or WebP. 10 MB maximum.
          </p>
          <div
            className={dragging ? "upload-zone dragging" : "upload-zone"}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              id="artwork-image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              aria-describedby="image-hint"
              onChange={(event) => takeFile(event.target.files?.[0])}
            />
            <span>{image ? "Replace image" : "Drop an image here, or choose a file."}</span>
          </div>
          {image ? (
            <div className="selected-image">
              {preview ? <img src={preview} alt="Selected artwork preview" /> : null}
              <p>{image.name}</p>
              <button type="button" onClick={() => setImage(null)}>
                Remove image
              </button>
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="artwork-id">
            Identifier <span className="hint">optional</span>
          </label>
          <input
            id="artwork-id"
            name="artwork_id"
            value={artworkId}
            autoComplete="off"
            aria-invalid={error.toLowerCase().includes("identifier") || undefined}
            aria-describedby={error.toLowerCase().includes("identifier") ? "artwork-id-error" : undefined}
            onChange={(event) => setArtworkId(event.target.value)}
          />
          {error.toLowerCase().includes("identifier") ? (
            <p id="artwork-id-error" className="alert" role="alert">
              {error}
            </p>
          ) : null}
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
        <div className="field prose-field">
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
            Text only. Not used as evidence.
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
        <fieldset className="evidence-set">
          <legend>Evidence concepts</legend>
          <p className="hint">Choose a concept. The description is not a concept.</p>
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
        {error && !error.toLowerCase().includes("identifier") ? (
          <p className="alert" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || !vocabulary}>
          {busy ? "Uploading…" : "Upload artwork"}
        </button>
      </form>
    </section>
  );
}
