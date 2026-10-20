import type { ArtworkSummary } from "../types";

interface ArtworkListProps {
  artworks: ArtworkSummary[];
  selectedId: string | null;
  busy: boolean;
  onOpen: (artworkId: string) => void;
}

export function ArtworkList({ artworks, selectedId, busy, onOpen }: ArtworkListProps) {
  return (
    <section aria-labelledby="stored-heading">
      <h2 id="stored-heading">Stored submissions</h2>
      {artworks.length === 0 ? <p>No submissions are stored in this snapshot yet.</p> : null}
      <ul className="saved">
        {artworks.map((artwork) => {
          const title = artwork.title || "(no title)";
          const selected = artwork.artwork_id === selectedId;
          return (
            <li key={artwork.artwork_id}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                disabled={busy}
                onClick={() => onOpen(artwork.artwork_id)}
              >
                <span className="saved-title">{title}</span>
                <span className="saved-id">{artwork.artwork_id}</span>
                <span className="saved-label">{artwork.label}</span>
                <code>{artwork.recommendation}</code>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
