"""The local interface returns MeTTa results and remains readable without color."""

import helpers  # noqa: F401

import json
import threading
import unittest
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from waziart.server import make_server
from waziart.service import ReviewService


class InterfaceTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.service = ReviewService(f"{self.directory.name}/space.metta")
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

    def test_page_is_labeled_and_the_workflow_is_reachable(self):
        page = self._text("/")
        self.assertIn("See the Reason. Challenge the Decision.", page)
        self.assertIn("<label for=\"title\">", page)
        self.assertIn("Permission to exhibit", page)
        self.assertIn('lang="en"', page)

        health = self._json("/api/health")
        self.assertEqual(health["hyperon"], "0.2.10")
        self.assertEqual(health["exhibition_theme"], "peace")

        created = self._json(
            "/api/artworks",
            {
                "artwork_id": "paths-to-peace",
                "title": "Paths to Peace <b>not bold</b>",
                "description": "Figures meet (and listen) beside a paper river.",
                "theme": "peace",
                "permission": "",
                "evidence": [{"concept": "reconciliation", "note": "Boats meet."}],
            },
            method="POST",
        )
        self.assertEqual(created["recommendation"], "request_information")
        self.assertEqual(created["label"], "Request information")
        self.assertIn("not a measure of artistic worth", created["disclaimer"])
        self.assertTrue(any("not treated as confirmed" in item["summary"] for item in created["trace"]))
        self.assertTrue(created["edges"])
        title = next(record["value"] for record in created["records"] if record["role"] == "title")
        self.assertIn("<b>not bold</b>", title)

        revised = self._json(
            "/api/artworks/paths-to-peace/challenges",
            {"role": "permission", "action": "correct", "value": "confirmed", "note": "Letter received."},
            method="POST",
        )
        self.assertEqual(revised["recommendation"], "recommend_for_review")
        self.assertIn("changed from request_information to recommend_for_review", revised["revisions"][-1]["summary"])
        self.assertEqual(revised["challenges"][-1]["note"], "Letter received.")
        self.assertIsNone(revised["challenges"][-1]["previous_value"])
        self.assertEqual(revised["challenges"][-1]["new_value"], "confirmed")
        self.assertTrue(any(item["role"] == "permission" and item["status"] == "current" for item in revised["history"]))

        status, missing = self._open("/api/artworks/does-not-exist")
        self.assertEqual(status, 404)
        self.assertEqual(missing["error"], "No submission is stored for does-not-exist.")

    def _json(self, path, payload=None, method="GET"):
        status, body = self._open(path, payload, method)
        self.assertLess(status, 400, body)
        return body

    def _open(self, path, payload=None, method="GET"):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(self.base + path, data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urlopen(request) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def _text(self, path):
        with urlopen(self.base + path) as response:
            return response.read().decode("utf-8")


if __name__ == "__main__":
    unittest.main()
