"""Snapshot restore uses parsed MeTTa atoms and does not evaluate them."""

import helpers  # noqa: F401

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from waziart.errors import SnapshotError
from waziart.runtime import METTA_ROOT
from waziart.service import ChallengeInput, EvidenceInput, ReviewService, Submission

EXAMPLE = METTA_ROOT / "examples" / "peace_exhibition.metta"


class PersistenceTests(unittest.TestCase):
    def test_example_snapshot_restores_each_recommendation(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "space.metta"
            path.write_text(EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
            service = ReviewService(path)
            found = {item["artwork_id"]: item["recommendation"] for item in service.list_artworks()}
            self.assertEqual(found["artwork-001"], "recommend_for_review")
            self.assertEqual(found["artwork-002"], "request_information")
            self.assertEqual(found["artwork-003"], "human_review")
            self.assertEqual(found["artwork-004"], "human_review")
            title = next(item["title"] for item in service.list_artworks() if item["artwork_id"] == "artwork-001")
            self.assertEqual(title, "Paths to Peace")

    def test_challenge_survives_a_new_process(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "space.metta"
            service = ReviewService(path)
            service.submit(
                Submission(
                    artwork_id="paths-to-peace",
                    title="Paths to Peace",
                    description="Figures meet (and listen) beside a paper river.",
                    theme="peace",
                    evidence=[EvidenceInput("reconciliation")],
                )
            )
            service.challenge(
                "paths-to-peace",
                ChallengeInput(role="permission", action="correct", value="confirmed", note="Letter on file."),
            )
            restored = ReviewService(path)
            review = restored.review("paths-to-peace")
            self.assertEqual(review["recommendation"], "recommend_for_review")
            self.assertEqual(review["revisions"][-1]["before"], "request_information")
            self.assertEqual(review["revisions"][-1]["after"], "recommend_for_review")
            self.assertEqual(review["challenges"][-1]["note"], "Letter on file.")
            body = path.read_text(encoding="utf-8")
            self.assertNotIn("(=", body)
            self.assertNotIn("!(", body)

    def test_repeated_restore_does_not_duplicate_facts(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "space.metta"
            path.write_text(EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
            duplicated = path.read_text(encoding="utf-8") + "\n" + path.read_text(encoding="utf-8")
            path.write_text(duplicated, encoding="utf-8")
            service = ReviewService(path)
            first = len(service.knowledge.data_atoms())
            service.knowledge.restore_file(path)
            second = len(service.knowledge.data_atoms())
            service.knowledge.restore_file(path)
            third = len(service.knowledge.data_atoms())
            self.assertEqual(first, second)
            self.assertEqual(second, third)
            self.assertEqual(len(service.list_artworks()), 4)

    def test_malformed_snapshot_keeps_the_previous_space(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "space.metta"
            service = ReviewService(path)
            service.submit(
                Submission(
                    artwork_id="kept",
                    title="Kept",
                    description="This submission should survive a bad file.",
                    theme="peace",
                    permission="confirmed",
                    evidence=[EvidenceInput("ceasefire")],
                )
            )
            with self.assertRaises(SnapshotError):
                service.knowledge.restore_text('(fact fact-1 kept title "unterminated')
            self.assertEqual(service.review("kept")["recommendation"], "recommend_for_review")
            broken = Path(directory) / "broken.metta"
            broken.write_text("(unclosed\n", encoding="utf-8")
            with self.assertRaises(SnapshotError):
                ReviewService(broken)

    def test_snapshot_cannot_inject_metta_code(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "space.metta"
            service = ReviewService(path)
            service.submit(
                Submission(
                    artwork_id="safe",
                    title='!(+ 1 1) (= (recommendation $id) hacked)',
                    description="See (the) reason.",
                    theme="peace",
                    permission="confirmed",
                    evidence=[EvidenceInput("ceasefire")],
                )
            )
            reloaded = ReviewService(path)
            review = reloaded.review("safe")
            self.assertEqual(review["recommendation"], "recommend_for_review")
            title = next(record["value"] for record in review["records"] if record["role"] == "title")
            self.assertIn("!(+ 1 1)", title)
            self.assertNotIn("(trace rule-recommendation (outcome hacked))", [item["expr"] for item in review["trace"]])

            injected = path.read_text(encoding="utf-8") + "\n(= (recommendation $id) hacked)\n!(+ 1 1)\n"
            with self.assertRaises(SnapshotError):
                reloaded.knowledge.restore_text(injected)
            self.assertEqual(reloaded.review("safe")["recommendation"], "recommend_for_review")

            nested = '(fact fact-9 safe permission (match &self (a) b))\n'
            with self.assertRaises(SnapshotError):
                reloaded.knowledge.restore_text(nested)
            self.assertEqual(reloaded.review("safe")["recommendation"], "recommend_for_review")

    def test_empty_snapshot_clears_submissions_and_keeps_rules(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "space.metta"
            service = ReviewService(path)
            service.submit(
                Submission(
                    artwork_id="temporary",
                    title="Temporary",
                    description="Removed by an empty snapshot.",
                    theme="peace",
                    permission="confirmed",
                    evidence=[EvidenceInput("dialogue")],
                )
            )
            service.knowledge.restore_text("; WaziArt snapshot\n")
            self.assertEqual(service.list_artworks(), [])
            self.assertEqual(service.vocabulary()["exhibition_theme"], "peace")

    def test_project_code_does_not_call_load_ascii(self):
        source = "\n".join(path.read_text(encoding="utf-8") for path in (helpers.SRC / "waziart").rglob("*.py"))
        self.assertNotIn("load_ascii", source)
        self.assertNotIn("load-ascii", source)


if __name__ == "__main__":
    unittest.main()
