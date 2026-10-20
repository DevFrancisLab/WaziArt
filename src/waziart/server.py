"""Small accessible HTTP interface over the review service.

The server validates JSON and renders MeTTa results. It does not contain
review rules.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import hyperon

from waziart import __version__
from waziart.errors import NotFoundError, WaziError
from waziart.explain import clean_question, explain_review
from waziart.present import LABELS, present_review
from waziart.images import CONTENT_TYPES, resolve_image
from waziart.service import ChallengeInput, EvidenceInput, ReviewService, Submission

STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_FILES = {
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}
MAX_JSON = 65_536
MAX_UPLOAD = 10 * 1024 * 1024 + MAX_JSON


def _submission(body: dict) -> Submission:
    """Build a submission from JSON. Missing fields stay missing."""
    evidence = body.get("evidence") or []
    if not isinstance(evidence, list):
        raise WaziError("Evidence must be a list.")
    items = []
    for item in evidence:
        if not isinstance(item, dict):
            raise WaziError("Each evidence item must be an object.")
        concept = item.get("concept", "")
        note = item.get("note", "")
        if not isinstance(concept, str) or not isinstance(note, str):
            raise WaziError("Evidence concept and note must be text.")
        items.append(EvidenceInput(concept, note))
    for key in ("artwork_id", "title", "description", "theme"):
        if key in body and body[key] is not None and not isinstance(body[key], str):
            raise WaziError(f"{key} must be text.")
    permission = body.get("permission")
    if permission is not None and not isinstance(permission, str):
        raise WaziError("Permission must be text.")
    return Submission(
        title=body.get("title") or "",
        description=body.get("description") or "",
        theme=body.get("theme") or "",
        permission=permission,
        evidence=items,
        artwork_id=body.get("artwork_id") or None,
    )


def _challenge(body: dict) -> ChallengeInput:
    """Build a challenge from JSON."""
    for key in ("role", "action", "value", "evidence_id", "note"):
        if key in body and body[key] is not None and not isinstance(body[key], str):
            raise WaziError(f"{key} must be text.")
    return ChallengeInput(
        role=str(body.get("role") or ""),
        action=str(body.get("action") or ""),
        value=str(body.get("value") or ""),
        evidence_id=str(body.get("evidence_id") or ""),
        note=str(body.get("note") or ""),
    )


class ReviewHandler(BaseHTTPRequestHandler):
    """JSON and HTML routes for one local ReviewService."""

    server: "ReviewServer"

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler name
        path = urlparse(self.path).path
        if path == "/":
            self._file(STATIC_DIR / "index.html", "text/html; charset=utf-8")
            return
        if path in STATIC_FILES:
            name, content_type = STATIC_FILES[path]
            self._file(STATIC_DIR / name, content_type)
            return
        if path == "/api/health":
            self._json(200, self.server.service.health())
            return
        if path == "/api/vocabulary":
            self._json(200, self.server.service.vocabulary())
            return
        if path == "/api/artworks":
            self._json(200, {"artworks": [self._summary(item) for item in self.server.service.list_artworks()]})
            return
        if path.startswith("/api/uploads/"):
            self._upload(path[len("/api/uploads/") :])
            return
        if path.startswith("/api/artworks/"):
            artwork_id = path[len("/api/artworks/") :]
            if not artwork_id or "/" in artwork_id:
                self._json(404, {"error": "That artwork was not found."})
                return
            try:
                self._json(200, present_review(self.server.service.review(artwork_id)))
            except WaziError as exc:
                self._error(exc)
            return
        self._json(404, {"error": "That page was not found."})

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler name
        path = urlparse(self.path).path
        try:
            if path == "/api/artworks" and self._is_multipart():
                fields, image = self._multipart()
                if image is None:
                    raise WaziError("Choose an artwork image.")
                review = self.server.service.submit(_submission(fields), image=image)
                self._json(201, present_review(review))
                return
            body = self._body()
            if path == "/api/artworks":
                review = self.server.service.submit(_submission(body))
                self._json(201, present_review(review))
                return
            prefix = "/api/artworks/"
            explanation = "/explanation"
            if path.startswith(prefix) and path.endswith(explanation):
                artwork_id = path[len(prefix) : -len(explanation)]
                review = present_review(self.server.service.review(artwork_id))
                self._json(200, explain_review(review, clean_question(body.get("question"))))
                return
            suffix = "/challenges"
            if path.startswith(prefix) and path.endswith(suffix):
                artwork_id = path[len(prefix) : -len(suffix)]
                review = self.server.service.challenge(artwork_id, _challenge(body))
                self._json(200, present_review(review))
                return
            self._json(404, {"error": "That page was not found."})
        except WaziError as exc:
            self._error(exc)
        except Exception:
            traceback.print_exc()
            self._json(500, {"error": "The review service failed before it could answer."})

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _is_multipart(self) -> bool:
        return self.headers.get("Content-Type", "").lower().startswith("multipart/form-data")

    def _upload(self, name: str) -> None:
        filename = unquote(name)
        if filename != name or "/" in filename or "\\" in filename:
            self._json(404, {"error": "That image was not found."})
            return
        try:
            path = resolve_image(self.server.service.uploads_dir(), filename)
            payload = path.read_bytes()
        except (WaziError, OSError):
            self._json(404, {"error": "That image was not found."})
            return
        self._bytes(200, payload, CONTENT_TYPES.get(path.suffix, "application/octet-stream"))

    def _multipart(self) -> tuple[dict, tuple[bytes, str] | None]:
        content_type = self.headers.get("Content-Type", "")
        raw = self._read(MAX_UPLOAD)
        fields, image = _parse_multipart(content_type, raw)
        evidence = fields.get("evidence", "[]")
        try:
            parsed = json.loads(evidence) if evidence else []
        except json.JSONDecodeError as exc:
            raise WaziError("Evidence must be a JSON list.") from exc
        fields["evidence"] = parsed
        return fields, image

    def _body(self) -> dict:
        raw = self._read(MAX_JSON) or b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as exc:
            raise WaziError("The request body must be JSON.") from exc
        if not isinstance(data, dict):
            raise WaziError("The request body must be a JSON object.")
        return data

    def _file(self, path: Path, content_type: str) -> None:
        try:
            payload = path.read_bytes()
        except OSError:
            self._json(404, {"error": "That page was not found."})
            return
        self._bytes(200, payload, content_type)

    def _error(self, exc: WaziError) -> None:
        status = getattr(exc, "http_status", None)
        if status is None:
            status = 404 if isinstance(exc, NotFoundError) else 400
        self._json(status, {"error": str(exc)})

    def _summary(self, item: dict) -> dict:
        recommendation = item["recommendation"]
        return {
            "artwork_id": item["artwork_id"],
            "title": item["title"],
            "recommendation": recommendation,
            "label": LABELS.get(recommendation, recommendation),
            "image": item.get("image"),
        }

    def _read(self, limit: int) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length < 0 or length > limit:
            raise WaziError("The request is too large.")
        return self.rfile.read(length) if length else b""

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._bytes(status, body, "application/json; charset=utf-8")

    def _bytes(self, status: int, payload: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'")
        self.end_headers()
        self.wfile.write(payload)


class ReviewServer(ThreadingHTTPServer):
    """Local server that shares one review service across requests."""

    daemon_threads = True

    def __init__(self, address: tuple[str, int], service: ReviewService):
        super().__init__(address, ReviewHandler)
        self.service = service


def _parse_multipart(content_type: str, body: bytes) -> tuple[dict, tuple[bytes, str] | None]:
    """Read form fields and one image part. The original filename is not a path."""
    match = re.search(r"""boundary\s*=\s*"?([^";]+)"?""", content_type, re.IGNORECASE)
    if not match:
        raise WaziError("The upload is missing a multipart boundary.")
    marker = b"--" + match.group(1).encode("ascii", "ignore")
    fields: dict[str, str] = {}
    image: tuple[bytes, str] | None = None
    for chunk in body.split(marker):
        chunk = chunk.strip(b"\r\n")
        if not chunk or chunk == b"--":
            continue
        if chunk.endswith(b"--"):
            chunk = chunk[:-2].strip(b"\r\n")
        header_blob, separator, data = chunk.partition(b"\r\n\r\n")
        if not separator:
            continue
        headers = header_blob.decode("utf-8", "replace")
        disposition = _header_value(headers, "content-disposition")
        name = _disposition_param(disposition, "name")
        if not name:
            continue
        if data.endswith(b"\r\n"):
            data = data[:-2]
        if name == "image":
            declared = _header_value(headers, "content-type").split(";", 1)[0].strip().lower()
            image = (data, declared or "application/octet-stream")
            continue
        fields[name] = data.decode("utf-8")
    return fields, image


def _header_value(headers: str, name: str) -> str:
    prefix = name.lower() + ":"
    for line in headers.split("\r\n"):
        if line.lower().startswith(prefix):
            return line.split(":", 1)[1].strip()
    return ""


def _disposition_param(disposition: str, key: str) -> str | None:
    match = re.search(rf"""(?:^|;)\s*{key}\s*=\s*"([^"]*)"|{key}\s*=\s*([^;]+)""", disposition, re.IGNORECASE)
    if not match:
        return None
    return (match.group(1) if match.group(1) is not None else match.group(2)).strip()


def make_server(service: ReviewService, host: str = "127.0.0.1", port: int = 8000) -> ReviewServer:
    """Bind a review server. Port 0 asks the operating system for a free port."""
    return ReviewServer((host, port), service)


def main(argv: list[str] | None = None) -> None:
    """Run the local WaziArt interface."""
    parser = argparse.ArgumentParser(description="Run the WaziArt review interface.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "space.metta",
        help="MeTTa snapshot used for submissions, challenges, and audit events.",
    )
    args = parser.parse_args(argv)
    try:
        service = ReviewService(args.data)
    except WaziError as exc:
        sys.stderr.write(f"{exc}\n")
        sys.exit(1)
    server = make_server(service, args.host, args.port)
    host, port = server.server_address[:2]
    print(f"WaziArt {__version__} — hyperon {hyperon.__version__}")
    print(f"Open http://{host}:{port}")
    print(f"Snapshot: {args.data}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
