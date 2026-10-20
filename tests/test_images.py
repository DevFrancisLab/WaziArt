"""Image uploads stay files. MeTTa stores the generated name, not the bytes."""

import helpers  # noqa: F401

import json
import threading
import unittest
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from waziart.server import make_server
from waziart.service import ReviewService

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 24
WEBP = b"RIFF" + b"\x18\x00\x00\x00" + b"WEBP" + b"\x00" * 16
GIF = b"GIF89a" + b"\x00" * 24


class ImageTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.snapshot = f"{self.directory.name}/space.metta"
        self.service = ReviewService(self.snapshot)
        self.server = make_server(self.service, "127.0.0.1", 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address[:2]
        self.base = f"http://{host}:{port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.directory.cleanup()

    def test_upload_is_saved_reloaded_and_does_not_change_the_recommendation(self):
        created = self._send(PNG, "image/png", filename="gallery scan.png")
        self.assertEqual(created["recommendation"], "request_information")
        self.assertTrue(created["image"].startswith("/api/uploads/"))
        self.assertTrue(created["image"].endswith(".png"))
        self.assertNotIn("gallery", created["image"])
        self.assertTrue(any("not treated as confirmed" in item["summary"] for item in created["trace"]))
        self.assertFalse(any(record["role"] == "artwork-image" for record in created["records"]))

        status, payload, content_type = self._bytes(created["image"])
        self.assertEqual(status, 200)
        self.assertEqual(payload, PNG)
        self.assertEqual(content_type, "image/png")

        reloaded = ReviewService(self.snapshot)
        review = reloaded.review("river-path")
        self.assertEqual(review["image"], created["image"])
        self.assertEqual(review["recommendation"], "request_information")
        self.assertTrue((reloaded.uploads_dir() / created["image"].rsplit("/", 1)[-1]).is_file())

        revised = self._json(
            "/api/artworks/river-path/challenges",
            {"role": "permission", "action": "correct", "value": "confirmed", "note": "Letter received."},
            method="POST",
        )
        self.assertEqual(revised["recommendation"], "recommend_for_review")
        self.assertEqual(revised["image"], created["image"])
        self.assertIn("changed from request_information to recommend_for_review", revised["revisions"][-1]["summary"])

    def test_webp_and_jpeg_signatures_are_accepted(self):
        jpeg = self._send(JPEG, "image/jpeg", artwork_id="jpeg-work")
        self.assertTrue(jpeg["image"].endswith(".jpg"))
        webp = self._send(WEBP, "image/webp", artwork_id="webp-work")
        self.assertTrue(webp["image"].endswith(".webp"))

    def test_unsupported_oversize_and_missing_images_are_rejected(self):
        status, body = self._open_upload(GIF, "image/gif", artwork_id="gif-work")
        self.assertEqual(status, 400)
        self.assertIn("JPEG, PNG, or WebP", body["error"])
        uploads = ReviewService(self.snapshot).uploads_dir()
        self.assertFalse(uploads.exists() and any(uploads.iterdir()))

        mismatch, mismatch_body = self._open_upload(PNG, "image/jpeg", artwork_id="mismatch-work")
        self.assertEqual(mismatch, 400)
        self.assertIn("does not match", mismatch_body["error"])

        huge = b"\xff\xd8\xff" + b"\x00" * (10 * 1024 * 1024)
        oversized, oversized_body = self._open_upload(huge, "image/jpeg", artwork_id="huge-work")
        self.assertEqual(oversized, 400)
        self.assertIn("10 MB", oversized_body["error"])

        missing, missing_body = self._open_upload(None, "image/png", artwork_id="missing-image")
        self.assertEqual(missing, 400)
        self.assertIn("Choose an artwork image", missing_body["error"])

        self.assertEqual(self._json("/api/artworks")["artworks"], [])

    def test_existing_artwork_without_an_image_remains_readable(self):
        created = self._json(
            "/api/artworks",
            {
                "artwork_id": "text-only",
                "title": "Text Only",
                "description": "A paper river.",
                "theme": "peace",
                "permission": "",
                "evidence": [],
            },
            method="POST",
        )
        self.assertIsNone(created["image"])
        self.assertEqual(created["recommendation"], "request_information")
        listed = self._json("/api/artworks")["artworks"]
        self.assertEqual(listed[0]["artwork_id"], "text-only")
        self.assertIsNone(listed[0]["image"])

    def test_image_route_rejects_path_traversal(self):
        status, body = self._open("/api/uploads/../space.metta")
        self.assertEqual(status, 404)
        self.assertIn("not found", body["error"])
        encoded, encoded_body = self._open("/api/uploads/%2e%2e%2fspace.metta")
        self.assertEqual(encoded, 404)
        self.assertIn("not found", encoded_body["error"])

    def _send(self, data, content_type, filename="work.png", artwork_id="river-path"):
        status, body = self._open_upload(data, content_type, filename, artwork_id)
        self.assertLess(status, 400, body)
        return body

    def _open_upload(self, data, content_type, filename="work.png", artwork_id="river-path"):
        boundary = "----waziarttest"
        parts = []
        fields = {
            "artwork_id": artwork_id,
            "title": "River Path",
            "description": "Figures meet beside a paper river.",
            "theme": "peace",
            "permission": "",
            "evidence": json.dumps([{"concept": "reconciliation", "note": "Boats meet."}]),
        }
        for key, value in fields.items():
            parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
            )
        if data is not None:
            parts.append(
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
                    f"Content-Type: {content_type}\r\n\r\n"
                ).encode()
                + data
                + b"\r\n"
            )
        parts.append(f"--{boundary}--\r\n".encode())
        payload = b"".join(parts)
        request = Request(self.base + "/api/artworks", data=payload, method="POST")
        request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        status, body, _content_type = self._response(request, json_body=True)
        return status, body

    def _json(self, path, payload=None, method="GET"):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(self.base + path, data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
        status, body, _content_type = self._response(request, json_body=True)
        self.assertLess(status, 400, body)
        return body

    def _open(self, path):
        request = Request(self.base + path)
        status, body, _content_type = self._response(request, json_body=True)
        return status, body

    def _bytes(self, path):
        request = Request(self.base + path)
        return self._response(request, json_body=False)

    def _response(self, request, json_body=True):
        try:
            with urlopen(request) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "")
                if json_body:
                    return response.status, json.loads(payload.decode("utf-8")), content_type
                return response.status, payload, content_type.split(";")[0]
        except HTTPError as exc:
            payload = exc.read()
            if json_body:
                return exc.code, json.loads(payload.decode("utf-8")), exc.headers.get("Content-Type", "")
            return exc.code, payload, exc.headers.get("Content-Type", "")


if __name__ == "__main__":
    unittest.main()
