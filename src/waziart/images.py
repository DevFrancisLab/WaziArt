"""Artwork image files.

The bytes live on disk. MeTTa stores only the generated filename.
Nothing here interprets the picture or changes a recommendation.
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path

from waziart.errors import NotFoundError, WaziError

MAX_IMAGE_BYTES = 10 * 1024 * 1024
IMAGE_NAME = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp)$")

_MIME = {
    ".jpg": frozenset({"image/jpeg", "image/jpg"}),
    ".png": frozenset({"image/png"}),
    ".webp": frozenset({"image/webp"}),
}
CONTENT_TYPES = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def store_image(directory: Path, data: bytes, declared_type: str) -> str:
    """Validate an upload and write it under a generated name."""
    extension = detected_extension(data, declared_type)
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(16) + extension
    if not IMAGE_NAME.fullmatch(name):
        raise WaziError("Could not name the uploaded image.")
    path = _inside(root, name)
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_bytes(data)
        temporary.replace(path)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise WaziError(f"The image could not be saved: {exc}") from exc
    if not path.is_file() or path.stat().st_size != len(data):
        path.unlink(missing_ok=True)
        raise WaziError("The image could not be saved.")
    return name


def discard_image(directory: Path, name: str) -> None:
    """Remove an upload this process just wrote. Unknown names are ignored."""
    if not IMAGE_NAME.fullmatch(name):
        return
    try:
        path = _inside(Path(directory), name)
    except NotFoundError:
        return
    if path.is_file():
        path.unlink()


def resolve_image(directory: Path, name: str) -> Path:
    """Return the file for a stored upload name, or raise NotFoundError."""
    if not isinstance(name, str) or not IMAGE_NAME.fullmatch(name):
        raise NotFoundError("That image was not found.")
    path = _inside(Path(directory), name)
    if not path.is_file():
        raise NotFoundError("That image was not found.")
    return path


def detected_extension(data: bytes, declared_type: str) -> str:
    """Return .jpg, .png, or .webp when the bytes and declared type agree."""
    if not isinstance(data, (bytes, bytearray)):
        raise WaziError("The image must be a file.")
    if len(data) > MAX_IMAGE_BYTES:
        raise WaziError("The image must be 10 MB or smaller.")
    if len(data) < 12:
        raise WaziError("The image file is empty or incomplete.")
    extension = _signature(bytes(data))
    if extension is None:
        raise WaziError("The image must be a JPEG, PNG, or WebP file.")
    declared = (declared_type or "").split(";", 1)[0].strip().lower()
    if declared not in _MIME[extension]:
        raise WaziError("The image type does not match its file contents.")
    return extension


def _signature(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    return None


def _inside(root: Path, name: str) -> Path:
    base = root.resolve()
    path = (base / name).resolve()
    if path.parent != base:
        raise NotFoundError("That image was not found.")
    return path
