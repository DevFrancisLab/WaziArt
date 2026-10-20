"""Challenges are new symbolic events. They do not erase the previous facts."""

import helpers  # noqa: F401

import unittest

from waziart.errors import NotFoundError, WaziError
from waziart.service import ChallengeInput, EvidenceInput, ReviewService, Submission


def exprs(review, key="trace"):
    return [item["expr"] for item in review[key]]


class ChallengeTests(unittest.TestCase):
    def setUp(self):
        self.service = ReviewService()

    def test_correcting_a_missing_permission_changes_the_recommendation(self):
        original = self.service.submit(
            Submission(
                artwork_id="bridge",
                title="Unfinished Bridge",
                description="Scaffolding remains on a bridge.",
                theme="peace",
                permission=None,
                evidence=[EvidenceInput("dialogue")],
            )
        )
        self.assertEqual(original["recommendation"], "request_information")
        revised = self.service.challenge(
            "bridge",
            ChallengeInput(
                role="permission",
                action="correct",
                value="confirmed",
                note="The gallery confirmed the right to exhibit this work.",
            ),
        )
        self.assertEqual(revised["recommendation"], "recommend_for_review")
        revision = revised["revisions"][-1]
        self.assertEqual(revision["before"], "request_information")
        self.assertEqual(revision["after"], "recommend_for_review")
        self.assertIn("request_information", revision["expr"])
        self.assertIn("recommend_for_review", revision["expr"])
        edges = exprs(revised, "edges")
        self.assertTrue(any("corrects none" in edge for edge in edges))
        self.assertTrue(any("changes request_information recommend_for_review" in edge for edge in edges))
        self.assertEqual(revised["challenges"][-1]["note"], "The gallery confirmed the right to exhibit this work.")
        self.assertIsNone(revised["challenges"][-1]["previous_value"])
        self.assertEqual(revised["challenges"][-1]["new_value"], "confirmed")
        self.assertNotIn("(trace rule-required (missing permission))", exprs(revised))

    def test_correcting_an_explicit_fact_preserves_the_old_fact(self):
        self.service.submit(
            Submission(
                artwork_id="named",
                title="Named Missing",
                description="Permission was entered as missing.",
                theme="peace",
                permission="missing",
                evidence=[EvidenceInput("mediation")],
            )
        )
        revised = self.service.challenge(
            "named",
            ChallengeInput(role="permission", action="correct", value="confirmed", note="Letter received."),
        )
        stored = "\n".join(repr(atom) for atom in self.service.knowledge.data_atoms())
        self.assertIn("permission missing", stored)
        self.assertIn("permission confirmed", stored)
        self.assertIn("(superseded-by ", stored)
        self.assertEqual(revised["recommendation"], "recommend_for_review")
        current = [record for record in revised["records"] if record["role"] == "permission"]
        self.assertEqual(current, [{"fact_id": current[0]["fact_id"], "role": "permission", "value": "confirmed"}])
        permission_history = [item for item in revised["history"] if item["role"] == "permission"]
        self.assertEqual(
            [(item["status"], item["value"]) for item in permission_history],
            [("superseded", "missing"), ("current", "confirmed")],
        )
        challenge = revised["challenges"][-1]
        self.assertEqual(challenge["previous_value"], "missing")
        self.assertEqual(challenge["new_value"], "confirmed")
        self.assertEqual(challenge["note"], "Letter received.")

    def test_disputing_evidence_changes_a_ready_submission(self):
        ready = self.service.submit(
            Submission(
                artwork_id="mural",
                title="Mural",
                description="A meeting place.",
                theme="peace",
                permission="confirmed",
                evidence=[EvidenceInput("reconciliation")],
            )
        )
        self.assertEqual(ready["recommendation"], "recommend_for_review")
        evidence = next(record for record in ready["records"] if record["role"] == "evidence")
        disputed = self.service.challenge(
            "mural",
            ChallengeInput(
                role="evidence",
                action="dispute",
                evidence_id=evidence["evidence_id"],
                note="The concept is contested.",
            ),
        )
        self.assertEqual(disputed["recommendation"], "human_review")
        self.assertEqual(disputed["revisions"][-1]["before"], "recommend_for_review")
        self.assertEqual(disputed["revisions"][-1]["after"], "human_review")
        self.assertTrue(any("disputes" in edge for edge in exprs(disputed, "edges")))
        still_there = [record for record in disputed["records"] if record["role"] == "evidence"]
        self.assertEqual(still_there[0]["value"], "reconciliation")
        confirmed = self.service.knowledge.query("(permission-confirmed mural)")
        self.assertEqual([repr(atom) for atom in confirmed], ["True"])

    def test_replacing_evidence_can_clear_a_human_review(self):
        self.service.submit(
            Submission(
                artwork_id="colors",
                title="Colors",
                description="A field of color.",
                theme="peace",
                permission="confirmed",
                evidence=[EvidenceInput("rainbows")],
            )
        )
        evidence = next(
            record for record in self.service.review("colors")["records"] if record["role"] == "evidence"
        )
        revised = self.service.challenge(
            "colors",
            ChallengeInput(
                role="evidence",
                action="correct",
                evidence_id=evidence["evidence_id"],
                value="community-repair",
                note="The concept was entered against the wrong token.",
            ),
        )
        self.assertEqual(revised["recommendation"], "recommend_for_review")
        current = [record for record in revised["records"] if record["role"] == "evidence"]
        self.assertEqual(current[0]["value"], "community-repair")
        stored = "\n".join(repr(atom) for atom in self.service.knowledge.data_atoms())
        self.assertIn("rainbows", stored)

    def test_unknown_artwork_and_empty_dispute_are_rejected(self):
        with self.assertRaises(NotFoundError):
            self.service.challenge("missing-work", ChallengeInput(role="permission", action="correct", value="confirmed"))
        self.service.submit(
            Submission(
                artwork_id="plain",
                title="Plain",
                description="No evidence yet.",
                theme="peace",
                permission="confirmed",
            )
        )
        with self.assertRaises(WaziError):
            self.service.challenge("plain", ChallengeInput(role="evidence", action="dispute"))


if __name__ == "__main__":
    unittest.main()
