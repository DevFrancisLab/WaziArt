import { useEffect, useState } from "react";
import { ApiError, challengeArtwork, getArtwork, getVocabulary, listArtworks, submitArtwork } from "./api";
import { AccessibleStatusMessage } from "./components/AccessibleStatusMessage";
import { ArtworkList } from "./components/ArtworkList";
import { ArtworkSubmissionForm } from "./components/ArtworkSubmissionForm";
import { ChallengeForm } from "./components/ChallengeForm";
import { ChallengeHistory } from "./components/ChallengeHistory";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { ReasoningGraph } from "./components/ReasoningGraph";
import { ReasoningTrace } from "./components/ReasoningTrace";
import { RevisionComparison } from "./components/RevisionComparison";
import type { ArtworkSummary, ChallengeBody, Review, SubmissionBody, Vocabulary } from "./types";

const ARTWORK_PARAM = "artwork";

/** The address remembers which submission is open so a reload can ask the API again. */
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
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"submit" | "challenge" | "open" | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Loading the exhibition vocabulary.");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
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
            showReview(next);
            return;
          } catch (error) {
            if (cancelled) return;
            const message = error instanceof ApiError ? error.message : "That stored submission could not be reopened.";
            setLoadError(message);
          }
        }
        setStatus(
          stored.length === 0
            ? "Vocabulary loaded. No submissions are stored in this snapshot yet."
            : `Vocabulary loaded. ${stored.length} stored submission${stored.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "The review service could not be loaded.";
        setLoadError(message);
        setStatus(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshList() {
    setArtworks(await listArtworks());
  }

  function showReview(next: Review) {
    setReview(next);
    rememberArtwork(next.artwork_id);
    setStatus(`${next.label} (${next.recommendation}). ${next.status_note}`);
  }

  async function refreshListQuietly() {
    try {
      await refreshList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The submission list could not be refreshed.";
      setLoadError(message);
    }
  }

  async function handleSubmit(body: SubmissionBody) {
    setPending("submit");
    setLoadError("");
    try {
      const next = await submitArtwork(body);
      showReview(next);
      document.getElementById("review-heading")?.focus();
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
      showReview(next);
      document.getElementById("revision-heading")?.focus();
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
      showReview(next);
      document.getElementById("review-heading")?.focus();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "That submission could not be opened.";
      setLoadError(message);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <a className="skip" href="#submission">
        Skip to submission
      </a>
      <header className="banner">
        <p className="mark">WaziArt</p>
        <h1>See the Reason. Challenge the Decision.</h1>
        <p className="lede">
          A next step for a human reviewer of a peace exhibition. A recommendation is not an artistic judgment, and it
          is not acceptance or rejection.
        </p>
      </header>
      <AccessibleStatusMessage message={status} />
      {loadError ? <AccessibleStatusMessage message={loadError} politeness="assertive" /> : null}
      <main className="layout">
        <div className="column">
          <ArtworkSubmissionForm vocabulary={vocabulary} busy={pending === "submit"} onSubmit={handleSubmit} />
          <ArtworkList
            artworks={artworks}
            selectedId={review?.artwork_id ?? null}
            busy={pending !== null}
            onOpen={(artworkId) => {
              void handleOpen(artworkId);
            }}
          />
        </div>
        <div className="column workspace" aria-label="Review workspace">
          {loading && !review ? <p className="empty">Loading the review service…</p> : null}
          {!loading && !review ? (
            <p className="empty">
              Submit an artwork, or open a stored submission, to see the recommendation, trace, and relationships MeTTa
              returns.
            </p>
          ) : null}
          {review ? (
            <>
              <RecommendationPanel review={review} vocabulary={vocabulary} />
              <ReasoningTrace trace={review.trace} />
              <ReasoningGraph edges={review.edges} />
              <RevisionComparison revisions={review.revisions} />
              <ChallengeHistory challenges={review.challenges} history={review.history} />
              <ChallengeForm
                key={`${review.artwork_id}-${review.challenges.length}-${review.recommendation}`}
                review={review}
                vocabulary={vocabulary}
                busy={pending === "challenge"}
                onSubmit={handleChallenge}
              />
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
