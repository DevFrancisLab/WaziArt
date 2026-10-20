import type { ArtworkSummary } from "../types";
import { ArtworkFigure } from "./ArtworkFigure";

interface ArtworkListProps {
  artworks: ArtworkSummary[];
  selectedId: string | null;
  busy: boolean;
  onOpen: (artworkId: string) => void;
}

export function ArtworkList({ artworks, selectedId, busy, onOpen }: ArtworkListProps) {
  return (
    <>
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
                <ArtworkFigure src={artwork.image} title={title} />
                <span className="saved-title">{title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
