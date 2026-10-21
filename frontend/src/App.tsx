import { useEffect, useRef, useState } from "react";
import { ApiError, challengeArtwork, explainArtwork, getArtwork, getVocabulary, listArtworks, submitArtwork } from "./api";
import { AccessibleStatusMessage } from "./components/AccessibleStatusMessage";
import { ArtworkFigure } from "./components/ArtworkFigure";
import { ArtworkSubmissionForm } from "./components/ArtworkSubmissionForm";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { ReviewDesk } from "./components/ReviewDesk";
import type { StoredExplanation } from "./components/SimpleExplanation";
import { Sidebar } from "./components/Sidebar";
import type { SectionKey } from "./conversation";
import { reviewStamp } from "./reviewStamp";
import type { ArtworkSummary, ChallengeBody, Review, SubmissionBody, Vocabulary } from "./types";

const ARTWORK_PARAM = "artwork";

const CLOSED_SECTIONS: Record<SectionKey, boolean> = {
  trace: false,
  graph: false,
  revision: false,
  history: false,
};

type Drawer = "upload" | "list" | "reasoning" | null;

function artworkInAddress(): string | null {
  const value = new URLSearchParams(window.location.search).get(ARTWORK_PARAM);
  const token = value?.trim() ?? "";
  return token ? token : null;
}

function rememberArtwork(artworkId: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(ARTWORK_PARAM) === artworkId) return;
  url.searchParams.set(ARTWORK_PARAM, artworkId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function App() {
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null);
  const [artworks, setArtworks] = useState<ArtworkSummary[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [sections, setSections] = useState(CLOSED_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"submit" | "challenge" | "open" | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<"review" | "revision" | null>(null);
  const reviewRef = useRef<Review | null>(null);
  const explainRequest = useRef(0);
  const [explanation, setExplanation] = useState<StoredExplanation | null>(null);
  const [explanationError, setExplanationError] = useState("");
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      setStatus("Loading…");
      try {
        const [terms, stored] = await Promise.all([getVocabulary(), listArtworks()]);
        if (cancelled) return;
        setVocabulary(terms);
        setArtworks(stored);
        const requested = artworkInAddress();
        if (requested) {
          try {
            const next = await getArtwork(requested);
            if (cancelled) return;
            showReview(next, "replace");
            return;
          } catch (error) {
            if (cancelled) return;
            const message = error instanceof ApiError ? error.message : "That artwork could not be opened.";
            setLoadError(message);
          }
        }
        setStatus(stored.length === 0 ? "No artwork yet" : "");
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "The review service could not be loaded.";
        setLoadError(message);
        setStatus("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function closeDrawer() {
    const back = returnFocus.current;
    returnFocus.current = null;
    setDrawer(null);
    window.setTimeout(() => back?.focus(), 0);
  }

  function openDrawer(next: Exclude<Drawer, null>) {
    if (drawer === next) {
      closeDrawer();
      return;
    }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer(next);
  }

  useEffect(() => {
    if (!drawer) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const paneId = drawer === "reasoning" ? "reasoning-drawer" : drawer === "upload" ? "upload-dialog" : "submission-drawer";
    const pane = document.getElementById(paneId);
    const focusable = () =>
      pane
        ? [...pane.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, [href]")].filter(
            (node) => !node.closest("[hidden]") && !node.hasAttribute("disabled") && node.tabIndex !== -1,
          )
        : [];
    const preferred = drawer === "upload" ? document.getElementById("artwork-image") : focusable()[0];
    if (pendingFocus.current !== "revision") preferred?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        const back = returnFocus.current;
        returnFocus.current = null;
        setDrawer(null);
        window.setTimeout(() => back?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  useEffect(() => {
    const next = pendingFocus.current;
    if (!next) return;
    pendingFocus.current = null;
    document.getElementById(next === "revision" ? "revision-heading" : "review-heading")?.focus();
  }, [review, drawer]);

  async function refreshList() {
    setArtworks(await listArtworks());
  }

  function showReview(next: Review, mode: "replace" | "challenge") {
    setReview(next);
    rememberArtwork(next.artwork_id);
    setStatus(next.label);
    if (mode === "challenge") {
      setSections({
        trace: false,
        graph: false,
        revision: next.revisions.length > 0,
        history: next.challenges.length > 0,
      });
      pendingFocus.current = next.revisions.length > 0 ? "revision" : null;
      setDrawer("reasoning");
      return;
    }
    setSections(CLOSED_SECTIONS);
    pendingFocus.current = "review";
    setDrawer(null);
  }

  async function refreshListQuietly() {
    try {
      await refreshList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The artwork list could not be refreshed.";
      setLoadError(message);
    }
  }

  async function handleSubmit(body: SubmissionBody, image: File) {
    setPending("submit");
    setLoadError("");
    try {
      const next = await submitArtwork(body, image);
      setFormEpoch((current) => current + 1);
      showReview(next, "replace");
      await refreshListQuietly();
    } finally {
      setPending(null);
    }
  }

  async function handleChallenge(body: ChallengeBody) {
    if (!review) return;
    setPending("challenge");
    setLoadError("");
    try {
      const next = await challengeArtwork(review.artwork_id, body);
      showReview(next, "challenge");
      await refreshListQuietly();
    } finally {
      setPending(null);
    }
  }

  async function handleOpen(artworkId: string) {
    setPending("open");
    setLoadError("");
    try {
      const next = await getArtwork(artworkId);
      showReview(next, "replace");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "That artwork could not be opened.";
      setLoadError(message);
    } finally {
      setPending(null);
    }
  }

  reviewRef.current = review;

  async function handleExplain(question: string) {
    const current = reviewRef.current;
    if (!current) return;
    const requestId = explainRequest.current + 1;
    explainRequest.current = requestId;
    const stamp = reviewStamp(current);
    setExplaining(true);
    setExplanation(null);
    setExplanationError("");
    try {
      const result = await explainArtwork(current.artwork_id, question);
      const latest = reviewRef.current;
      if (requestId !== explainRequest.current || !latest || reviewStamp(latest) !== stamp) return;
      if (result.artwork_id !== latest.artwork_id || result.recommendation !== latest.recommendation) return;
      setExplanation({
        stamp,
        artworkId: result.artwork_id,
        recommendation: result.recommendation,
        text: result.explanation,
        model: result.model,
      });
    } catch (error) {
      if (requestId !== explainRequest.current) return;
      const message = error instanceof Error ? error.message : "The simple explanation could not be written.";
      setExplanationError(message);
    } finally {
      if (requestId === explainRequest.current) setExplaining(false);
    }
  }

  const showEmpty = !loading && !loadError && !review && artworks.length === 0;
  const showChooser = !loading && !loadError && !review && artworks.length > 0;
  const title = review?.records.find((record) => record.role === "title")?.value || review?.artwork_id;
  const actions = (
        <div className="workspace-actions">
          <button
            type="button"
            className="primary"
            aria-expanded={drawer === "upload"}
            aria-controls="upload-dialog"
            onClick={() => openDrawer("upload")}
          >
            Upload artwork
          </button>
          <button
            type="button"
            className="secondary"
            aria-expanded={drawer === "list"}
            aria-controls="submission-drawer"
            onClick={() => openDrawer("list")}
          >
            Submissions
          </button>
          {review ? (
            <button
              type="button"
              className="secondary"
              aria-expanded={drawer === "reasoning"}
              aria-controls="reasoning-drawer"
              onClick={() => openDrawer("reasoning")}
            >
              See reasoning
            </button>
          ) : null}
        </div>
  );

  return (
    <div className="app">
      <a className="skip" href="#review">
        Skip to review
      </a>
      <main className={showEmpty || showChooser ? "workspace workspace-idle" : "workspace"} id="review">
        {loading ? (
          <>
            <p className="mark">WaziArt</p>
            <AccessibleStatusMessage message={status || "Loading…"} />
          </>
        ) : showEmpty || showChooser ? (
          <div className="idle">
            <p className="mark">WaziArt</p>
            <h1>{showEmpty ? "No artwork yet" : "Choose an artwork"}</h1>
            {actions}
          </div>
        ) : (
          <>
            <p className="mark">WaziArt</p>
            {loadError ? (
              <p className="live alert" role="alert">
                {loadError}{" "}
                <button type="button" onClick={() => setAttempt((current) => current + 1)}>
                  Try again
                </button>
              </p>
            ) : null}
            {review ? (
              <article className="review">
                <ArtworkFigure large src={review.image} title={title || review.artwork_id} />
                <RecommendationPanel review={review} />
              </article>
            ) : null}
            {actions}
          </>
        )}
      </main>
      {drawer ? (
        <button
          type="button"
          className={drawer === "list" ? "scrim" : "scrim scrim-modal"}
          aria-label="Close panel"
          onClick={closeDrawer}
        />
      ) : null}
      <div
        id="upload-dialog"
        className="modal"
        hidden={drawer !== "upload"}
        role={drawer === "upload" ? "dialog" : undefined}
        aria-modal={drawer === "upload" ? true : undefined}
        aria-label="Upload artwork"
      >
        <button type="button" className="drawer-close" onClick={closeDrawer}>
          Close
        </button>
        <ArtworkSubmissionForm
          key={formEpoch}
          vocabulary={vocabulary}
          busy={pending === "submit"}
          onSubmit={handleSubmit}
        />
      </div>
      <aside
        id="submission-drawer"
        className="drawer drawer-left"
        hidden={drawer !== "list"}
        role={drawer === "list" ? "dialog" : undefined}
        aria-modal={drawer === "list" ? true : undefined}
        aria-label="Submissions"
      >
        <button type="button" className="drawer-close" onClick={closeDrawer}>
          Close
        </button>
        <Sidebar
          artworks={artworks}
          selectedId={review?.artwork_id ?? null}
          busy={pending !== null}
          query={query}
          onQuery={setQuery}
          onOpen={(artworkId) => {
            void handleOpen(artworkId);
          }}
        />
      </aside>
      <div
        id="reasoning-drawer"
        className="modal reasoning-panel"
        hidden={drawer !== "reasoning"}
        role={drawer === "reasoning" ? "dialog" : undefined}
        aria-modal={drawer === "reasoning" ? true : undefined}
        aria-label="See reasoning"
      >
        <header className="reasoning-bar">
          <div>
            <p className="mark">Reasoning</p>
            <p className="reasoning-title">{title || "Review"}</p>
          </div>
          <button type="button" className="reasoning-close" onClick={closeDrawer}>
            Close
          </button>
        </header>
        <div className="reasoning-body">
          {review ? (
            <ReviewDesk
              review={review}
              vocabulary={vocabulary}
              busy={pending === "challenge"}
              sections={sections}
              onSection={(key, open) => setSections((current) => ({ ...current, [key]: open }))}
              onChallenge={handleChallenge}
              explanation={explanation}
              explanationError={explanationError}
              explaining={explaining}
              onExplain={(question) => {
                void handleExplain(question);
              }}
            />
          ) : (
            <p className="hint">Open an artwork to see its review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
