import type { ArtworkSummary } from "../types";
import { ArtworkList } from "./ArtworkList";

interface SidebarProps {
  artworks: ArtworkSummary[];
  selectedId: string | null;
  busy: boolean;
  query: string;
  onQuery: (value: string) => void;
  onOpen: (artworkId: string) => void;
}

/** Saved artworks for the submissions panel. It does not invent entries. */
export function Sidebar({ artworks, selectedId, busy, query, onQuery, onOpen }: SidebarProps) {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? artworks.filter((artwork) =>
        [artwork.title, artwork.artwork_id, artwork.label].join(" ").toLowerCase().includes(needle),
      )
    : artworks;

  return (
    <section>
      <div className="field">
        <label htmlFor="submission-filter">Filter</label>
        <input id="submission-filter" value={query} autoComplete="off" onChange={(event) => onQuery(event.target.value)} />
      </div>
      {artworks.length === 0 ? <p>No artwork yet</p> : null}
      <ArtworkList artworks={visible} selectedId={selectedId} busy={busy} onOpen={onOpen} />
      {artworks.length > 0 && visible.length === 0 ? <p className="hint">No match.</p> : null}
    </section>
  );
}
