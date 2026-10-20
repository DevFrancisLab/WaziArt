"""MeTTa loads the exhibition rules and infers each recommendation itself."""

import helpers  # noqa: F401

import unittest

from waziart.errors import WaziError
from waziart.present import present_review
from waziart.service import EvidenceInput, ReviewService, Submission


def exprs(review, key="trace"):
    return [item["expr"] for item in review[key]]


class ReasoningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = ReviewService()

    def test_hyperon_loads_exhibition_facts(self):
        health = self.service.health()
        self.assertEqual(health["hyperon"], "0.2.10")
        self.assertEqual(health["exhibition_theme"], "peace")
        concepts = self.service.vocabulary()["concepts"]
        self.assertIn("reconciliation", concepts)
        self.assertIn("dialogue", concepts)

    def test_recommend_for_review_when_facts_align(self):
        review = self._submit("ready", permission="confirmed", concept="reconciliation")
        self.assertEqual(review["recommendation"], "recommend_for_review")
        self.assertIn("(trace rule-recommendation (outcome recommend_for_review))", exprs(review))
        self.assertIn("(trace rule-theme (aligned peace))", exprs(review))
        self.assertIn("(trace rule-permission (supplied confirmed))", exprs(review))
        self.assertTrue(any("description uninterpreted" in item for item in exprs(review)))
        evidence = next(record for record in review["records"] if record["role"] == "evidence")
        edges = exprs(review, "edges")
        self.assertTrue(any(f"has-evidence {evidence['evidence_id']}" in edge for edge in edges))
        self.assertTrue(any("reconciliation supports theme-alignment" in edge for edge in edges))
        self.assertTrue(any("theme-alignment evaluated-by rule-theme-support" in edge for edge in edges))
        self.assertTrue(any("derives recommend_for_review" in edge for edge in edges))

    def test_missing_permission_is_not_confirmed(self):
        review = self._submit("gap", permission=None, concept="dialogue")
        self.assertEqual(review["recommendation"], "request_information")
        self.assertIn("(trace rule-required (missing permission))", exprs(review))
        confirmed = self.service.knowledge.query("(permission-confirmed gap)")
        self.assertEqual([repr(atom) for atom in confirmed], ["False"])

    def test_explicit_missing_permission_is_not_confirmed(self):
        review = self._submit("marked-missing", permission="missing", concept="mediation")
        self.assertEqual(review["recommendation"], "request_information")
        self.assertIn("(trace rule-permission (supplied missing))", exprs(review))
        self.assertIn("(trace rule-required (missing permission))", exprs(review))
        confirmed = self.service.knowledge.query("(permission-confirmed marked-missing)")
        self.assertEqual([repr(atom) for atom in confirmed], ["False"])
        shown = present_review(review)
        text = " ".join(item["summary"] for item in shown["trace"])
        self.assertIn("not treated as confirmed", text)

    def test_disputed_permission_needs_a_person(self):
        review = self._submit("disputed", permission="disputed", concept="memorial")
        self.assertEqual(review["recommendation"], "human_review")
        self.assertIn("(trace rule-dispute (disputed permission))", exprs(review))
        self.assertTrue(any("derives human_review" in edge for edge in exprs(review, "edges")))

    def test_evidence_that_does_not_support_the_theme_needs_a_person(self):
        review = self._submit(
            "rainbows",
            permission="confirmed",
            concept="rainbows",
            description="The word reconciliation appears here only as prose.",
        )
        self.assertEqual(review["recommendation"], "human_review")
        self.assertTrue(any("evidence-does-not-support-theme" in item for item in exprs(review)))
        self.assertFalse(any("rainbows supports" in edge for edge in exprs(review, "edges")))

    def test_description_text_is_not_evidence(self):
        review = self._submit(
            "prose",
            permission="confirmed",
            concept=None,
            description="A reconciliation mural about dialogue and peace.",
        )
        self.assertEqual(review["recommendation"], "request_information")
        self.assertIn("(trace rule-required (missing evidence))", exprs(review))
        self.assertFalse(any("supports theme-alignment" in edge for edge in exprs(review, "edges")))

    def test_theme_outside_the_exhibition_needs_a_person(self):
        review = self._submit("other-theme", permission="confirmed", concept="reconciliation", theme="war")
        self.assertEqual(review["recommendation"], "human_review")
        self.assertIn("(trace rule-theme (not-aligned war))", exprs(review))

    def test_dispute_takes_precedence_over_missing_information(self):
        review = self.service.submit(
            Submission(
                artwork_id="contested-gap",
                title="",
                description="",
                theme="",
                permission="disputed",
                evidence=[],
            )
        )
        self.assertEqual(review["recommendation"], "human_review")
        self.assertTrue(
            any("dispute-takes-precedence-over-missing-information" in item for item in exprs(review))
        )

    def test_trace_outcome_matches_the_recommendation_query(self):
        review = self.service.review("ready")
        outcome = "(trace rule-recommendation (outcome recommend_for_review))"
        self.assertIn(outcome, exprs(review))
        self.assertTrue(any("derives recommend_for_review" in edge for edge in exprs(review, "edges")))

    def test_unsafe_identifiers_are_rejected(self):
        with self.assertRaises(WaziError):
            self.service.review("ready)!(+ 1 1)")
        with self.assertRaises(WaziError):
            self._submit("bad-concept", permission="confirmed", concept="!(hack)")

    def _submit(self, artwork_id, permission, concept, description="A paper river.", theme="peace", title=None):
        evidence = [] if concept is None else [EvidenceInput(concept, "A structured note.")]
        return self.service.submit(
            Submission(
                artwork_id=artwork_id,
                title=title or artwork_id,
                description=description,
                theme=theme,
                permission=permission,
                evidence=evidence,
            )
        )


if __name__ == "__main__":
    unittest.main()
