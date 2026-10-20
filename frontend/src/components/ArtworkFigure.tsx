interface ArtworkFigureProps {
  src?: string | null;
  title: string;
  large?: boolean;
}

/** The stored picture is for the reviewer. It is not symbolic evidence. */
export function ArtworkFigure({ src, title, large = false }: ArtworkFigureProps) {
  const name = title.trim() || "Untitled artwork";
  if (!src) {
    return <p className={large ? "image-missing" : "thumb-missing"}>No image</p>;
  }
  return (
    <figure className={large ? "artwork-frame" : "thumb-frame"}>
      <img src={src} alt={`Artwork: ${name}`} />
    </figure>
  );
}
