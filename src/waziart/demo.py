"""Reproducible three-minute demonstration of the review workflow.

Run from the repository with the project virtualenv active:

    PYTHONPATH=src python -m waziart.demo
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from waziart.errors import WaziError
from waziart.service import ChallengeInput, EvidenceInput, ReviewService, Submission


def main(argv: list[str] | None = None) -> None:
    """Submit a sample, challenge one fact, and print both recommendations."""
    parser = argparse.ArgumentParser(description="Run the WaziArt sample workflow.")
    parser.add_argument(
        "--data",
        type=Path,
        default=None,
        help="Snapshot file. Defaults to a temporary file.",
    )
    args = parser.parse_args(argv)
    path = args.data
    if path is None:
        directory = tempfile.mkdtemp(prefix="waziart-demo-")
        path = Path(directory) / "space.metta"
    try:
        service = ReviewService(path)
    except WaziError as exc:
        sys.stderr.write(f"{exc}\n")
        sys.exit(1)

    print("WaziArt — See the Reason. Challenge the Decision.")
    print("A recommendation assists a human reviewer. It is not an exhibition decision.")
    print(f"Snapshot: {path}")
    print()

    missing = service.submit(
        Submission(
            artwork_id="paths-to-peace",
            title="Paths to Peace",
            description="Figures meet (and listen) beside a paper river.",
            theme="peace",
            permission=None,
            evidence=[EvidenceInput("reconciliation", "The boats meet in the middle of the corridor.")],
        )
    )
    _expect(missing["recommendation"], "request_information", "Paths to Peace, before the challenge")
    _print_reasons(missing)

    disputed = service.submit(
        Submission(
            artwork_id="disputed-memorial",
            title="Disputed Memorial",
            description="A shared wall lists names the two communities do not yet agree how to read.",
            theme="peace",
            permission="disputed",
            evidence=[EvidenceInput("memorial")],
        )
    )
    _expect(disputed["recommendation"], "human_review", "Disputed Memorial")

    revised = service.challenge(
        "paths-to-peace",
        ChallengeInput(
            role="permission",
            action="correct",
            value="confirmed",
            note="The gallery confirmed the right to exhibit this work.",
        ),
    )
    _expect(revised["recommendation"], "recommend_for_review", "Paths to Peace, after the correction")
    revision = revised["revisions"][-1]
    print()
    print(
        f"Revision {revision['revision_id']}: {revision['before']} → {revision['after']}"
    )
    print(revision["expr"])
    if revision["before"] == revision["after"]:
        sys.exit("The sample challenge did not change the recommendation.")
    print()
    print("The previous permission gap remains in the snapshot as history.")
    print("Done.")


def _expect(actual: str, expected: str, label: str) -> None:
    print(f"{label}: {actual}")
    if actual != expected:
        sys.exit(f"Expected {expected}.")


def _print_reasons(review: dict) -> None:
    for item in review["trace"]:
        expr = item["expr"]
        if "missing" in expr or "outcome" in expr or "supports" in expr:
            print(f"  {expr}")


if __name__ == "__main__":
    main()
