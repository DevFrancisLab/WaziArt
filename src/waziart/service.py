"""Submission, challenge, and review orchestration.

This module validates structure, stores atoms, and asks MeTTa what follows.
The recommendation symbol is the result of ``(recommendation Artwork)``.
Nothing here maps missing fields onto a verdict with ordinary conditionals.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path

import hyperon
from hyperon import Atom, ExpressionAtom, SymbolAtom

from waziart import __version__

from waziart.errors import NotFoundError, WaziError
from waziart.images import discard_image, store_image
from waziart.runtime import KnowledgeBase, atom_symbol, expression_children
from waziart.symbols import (
    ACTIONS,
    PERMISSIONS,
    RECOMMENDATIONS,
    clean_text,
    fact_evidence,
    fact_note,
    fact_symbol,
    fact_text,
    grounded_text,
    image_reference,
    link,
    require_symbol,
    sym,
    text_atom,
    to_data,
    validate_data_atom,
)
from hyperon import E, S


@dataclass
class EvidenceInput:
    """One artist-supplied evidence concept and an optional prose note."""

    concept: str
    note: str = ""


@dataclass
class Submission:
    """Fields an artist may supply. Blank fields are omitted, not invented."""

    title: str = ""
    description: str = ""
    theme: str = ""
    permission: str | None = None
    evidence: list[EvidenceInput] = field(default_factory=list)
    artwork_id: str | None = None
    image_name: str | None = None


@dataclass
class ChallengeInput:
    """A request to dispute a current fact or to replace it with a correction."""

    role: str
    action: str
    value: str = ""
    evidence_id: str = ""
    note: str = ""


class ReviewService:
    """Thread-safe façade over one knowledge base."""

    def __init__(self, snapshot_path: Path | None = None):
        self._lock = threading.RLock()
        self.knowledge = KnowledgeBase(snapshot_path)

    def health(self) -> dict:
        """Report the runtime version and whether a snapshot path is configured."""
        with self._lock:
            theme = self._one_symbol(self.knowledge.query("(exhibition)"), "exhibition theme")
            return {
                "status": "ok",
                "service": "waziart",
                "version": __version__,
                "hyperon": hyperon.__version__,
                "exhibition_theme": theme,
                "persistence": (
                    "metta-atom-snapshot" if self.knowledge.snapshot_path else "memory"
                ),
                "data_atoms": len(self.knowledge.data_atoms()),
            }

    def vocabulary(self) -> dict:
        """Exhibition theme and evidence concepts, both read from MeTTa."""
        with self._lock:
            theme = self._one_symbol(self.knowledge.query("(exhibition)"), "exhibition theme")
            concepts = sorted(
                name
                for name in (atom_symbol(atom) for atom in self.knowledge.query("(evidence-concept)"))
                if name
            )
        return {
            "exhibition_theme": theme,
            "concepts": concepts,
            "permissions": list(PERMISSIONS),
            "recommendations": list(RECOMMENDATIONS),
        }

    def submit(self, submission: Submission, image: tuple[bytes, str] | None = None) -> dict:
        """Store a submission and return the recommendation MeTTa infers.

        ``image`` is ``(bytes, declared content type)``. The file is written
        before the atoms are committed. A failed commit removes that file.
        """
        with self._lock:
            artwork_id = self._new_artwork_id(submission.artwork_id)
            saved_name = None
            try:
                if image is not None:
                    data, declared = image
                    saved_name = store_image(self.uploads_dir(), data, declared)
                    submission.image_name = saved_name
                atoms = self._submission_atoms(artwork_id, submission)
                self._commit(atoms)
                self.knowledge.save()
            except Exception:
                if saved_name:
                    discard_image(self.uploads_dir(), saved_name)
                raise
            return self._review(artwork_id, highlight=None)

    def uploads_dir(self) -> Path:
        """Directory for image files that belong to this snapshot."""
        if self.knowledge.snapshot_path is None:
            raise WaziError("Image uploads need a snapshot directory.")
        return self.knowledge.snapshot_path.parent / "uploads"

    def challenge(self, artwork_id: str, challenge: ChallengeInput) -> dict:
        """Record a challenge, infer again, and keep both recommendations."""
        with self._lock:
            artwork_id = require_symbol(artwork_id, "artwork id")
            self._require_known(artwork_id)
            before = self._recommendation(artwork_id)
            atoms = self._challenge_atoms(artwork_id, challenge)
            self._commit(atoms)
            after = self._recommendation(artwork_id)
            delta = self._delta(before, after)
            revision_id = self.knowledge.allocate("revision")[0]
            audit_id = self.knowledge.allocate("audit")[0]
            self._commit(
                [
                    link(
                        "revision-compare",
                        revision_id,
                        artwork_id,
                        delta["before"],
                        delta["after"],
                    ),
                    link("audit", audit_id, "revised", artwork_id, revision_id),
                ]
            )
            self.knowledge.save()
            return self._review(artwork_id, highlight=revision_id)

    def review(self, artwork_id: str) -> dict:
        """Return the current inference for an artwork that has been submitted."""
        with self._lock:
            artwork_id = require_symbol(artwork_id, "artwork id")
            self._require_known(artwork_id)
            return self._review(artwork_id, highlight=None)

    def list_artworks(self) -> list[dict]:
        """List submitted works and the recommendation currently inferred for each."""
        with self._lock:
            summaries = []
            for artwork_id in self._artwork_ids():
                title_atoms = self.knowledge.query(f"(current-title {artwork_id})")
                title = grounded_text(title_atoms[0]) if len(title_atoms) == 1 else ""
                recommendation = self._recommendation(artwork_id)
                summaries.append(
                    {
                        "artwork_id": artwork_id,
                        "title": title or "",
                        "recommendation": recommendation,
                        "image": self._image_url(artwork_id),
                    }
                )
            return summaries

    def _review(self, artwork_id: str, highlight: str | None) -> dict:
        recommendation = self._recommendation(artwork_id)
        return {
            "artwork_id": artwork_id,
            "image": self._image_url(artwork_id),
            "recommendation": recommendation,
            "trace": [self._quoted(atom) for atom in self.knowledge.query(f"(trace-item {artwork_id})")],
            "edges": [self._quoted(atom) for atom in self.knowledge.query(f"(graph-edge {artwork_id})")],
            "records": [self._record(atom) for atom in self.knowledge.query(f"(live-record {artwork_id})")],
            "history": self._history(artwork_id),
            "revisions": self._revisions(artwork_id, highlight),
            "challenges": self._challenges(artwork_id),
        }

    def _recommendation(self, artwork_id: str) -> str:
        name = self._one_symbol(
            self.knowledge.query(f"(recommendation {artwork_id})"),
            "recommendation",
        )
        if name not in RECOMMENDATIONS:
            raise WaziError(
                f"MeTTa returned {name!r}, which is not one of the three review recommendations."
            )
        return name

    def _delta(self, before: str, after: str) -> dict:
        """Ask MeTTa whether the two inferred symbols differ."""
        atoms = self.knowledge.query(f"(outcome-delta {before} {after})")
        if len(atoms) != 1:
            raise WaziError("MeTTa did not return one revision comparison.")
        children = expression_children(atoms[0])
        if not children or atom_symbol(children[0]) not in {"changed", "unchanged"}:
            raise WaziError("MeTTa returned an unexpected revision comparison.")
        kind = atom_symbol(children[0])
        if kind == "unchanged":
            if len(children) != 2 or atom_symbol(children[1]) != before or before != after:
                raise WaziError("The revision comparison did not match the inferred recommendations.")
            observed_before = observed_after = before
        else:
            if len(children) != 3:
                raise WaziError("The revision comparison did not match the inferred recommendations.")
            observed_before = atom_symbol(children[1])
            observed_after = atom_symbol(children[2])
            if observed_before != before or observed_after != after:
                raise WaziError("The revision comparison did not match the inferred recommendations.")
        return {
            "kind": kind,
            "before": observed_before,
            "after": observed_after,
            "expr": repr(atoms[0]),
        }

    def _new_artwork_id(self, requested: str | None) -> str:
        if requested is None or requested.strip() == "":
            artwork_id = self.knowledge.allocate("artwork")[0]
        else:
            artwork_id = require_symbol(requested, "artwork id")
        if artwork_id in self._artwork_ids():
            raise WaziError(f"An artwork with id {artwork_id} already exists.")
        return artwork_id

    def _submission_atoms(self, artwork_id: str, submission: Submission) -> list[Atom]:
        title = clean_text(submission.title, "title", limit=200)
        description = clean_text(submission.description, "description", limit=2000)
        theme = _optional_symbol(submission.theme, "theme")
        permission = _optional_permission(submission.permission)
        evidence = [_clean_evidence(item) for item in submission.evidence]

        prose = [(role, text) for role, text in (("title", title), ("description", description)) if text]
        symbolic = [(role, value) for role, value in (("theme", theme), ("permission", permission)) if value]
        noted = [item for item in evidence if item[1]]
        count = len(prose) + len(symbolic) + len(evidence) + len(noted)
        fact_ids = self.knowledge.allocate("fact", count) if count else []
        evidence_ids = self.knowledge.allocate("evidence", len(evidence)) if evidence else []
        audit_id = self.knowledge.allocate("audit")[0]
        cursor = 0
        atoms: list[Atom] = [link("audit", audit_id, "submitted", artwork_id, artwork_id)]
        for role, text in prose:
            atoms.append(fact_text(fact_ids[cursor], artwork_id, role, text))
            cursor += 1
        for role, value in symbolic:
            atoms.append(fact_symbol(fact_ids[cursor], artwork_id, role, value))
            cursor += 1
        for index, (concept, note) in enumerate(evidence):
            evidence_id = evidence_ids[index]
            atoms.append(fact_evidence(fact_ids[cursor], artwork_id, evidence_id, concept))
            cursor += 1
            if note:
                atoms.append(fact_note(fact_ids[cursor], artwork_id, evidence_id, note))
                cursor += 1
        if cursor != len(fact_ids):
            raise WaziError("Could not allocate fact identifiers.")
        if submission.image_name:
            atoms.append(image_reference(artwork_id, submission.image_name))
        return atoms

    def _challenge_atoms(self, artwork_id: str, challenge: ChallengeInput) -> list[Atom]:
        role = require_symbol(challenge.role, "fact")
        action = require_symbol(challenge.action, "action", allow_reserved=True)
        if action not in ACTIONS:
            raise WaziError("A challenge must correct or dispute a fact.")
        note = clean_text(challenge.note, "note", limit=500)
        evidence_id = challenge.evidence_id.strip().lower()
        if evidence_id:
            evidence_id = require_symbol(evidence_id, "evidence id")

        if role == "evidence":
            return self._challenge_evidence(artwork_id, action, challenge.value, evidence_id, note)
        if role in {"title", "description", "theme", "permission"}:
            if evidence_id:
                raise WaziError("That fact does not use an evidence id.")
            return self._challenge_field(artwork_id, role, action, challenge.value, note)
        raise WaziError("Choose a title, description, theme, permission, or evidence fact.")

    def _challenge_field(
        self, artwork_id: str, role: str, action: str, value: str, note: str
    ) -> list[Atom]:
        current = self._fact_ids(f"(live-fact {artwork_id} {role} $fid)")
        if action == "dispute":
            if not current:
                raise WaziError(f"There is no current {role} fact to dispute.")
            return self._dispute_atoms(artwork_id, current, note)
        return self._correct_field(artwork_id, role, value, current, note)

    def _correct_field(
        self, artwork_id: str, role: str, value: str, current: list[str], note: str
    ) -> list[Atom]:
        if role in {"title", "description"}:
            text = clean_text(value, role, limit=200 if role == "title" else 2000)
            if not text:
                raise WaziError(f"A corrected {role} cannot be blank.")
            fact_id = self.knowledge.allocate("fact")[0]
            fresh: Atom = fact_text(fact_id, artwork_id, role, text)
        elif role == "theme":
            theme = require_symbol(value, "theme")
            fact_id = self.knowledge.allocate("fact")[0]
            fresh = fact_symbol(fact_id, artwork_id, "theme", theme)
        else:
            permission = _optional_permission(value)
            if permission is None:
                raise WaziError("A corrected permission must be confirmed, missing, or disputed.")
            fact_id = self.knowledge.allocate("fact")[0]
            fresh = fact_symbol(fact_id, artwork_id, "permission", permission)
        return self._correction_atoms(artwork_id, current, fact_id, fresh, note)

    def _challenge_evidence(
        self, artwork_id: str, action: str, value: str, evidence_id: str, note: str
    ) -> list[Atom]:
        if action == "dispute":
            if not evidence_id:
                raise WaziError("Choose the evidence item to dispute.")
            current = self._fact_ids(f"(live-evidence-fact {artwork_id} {evidence_id} $fid)")
            if not current:
                raise WaziError("That evidence item is not current.")
            return self._dispute_atoms(artwork_id, current, note)

        concept = require_symbol(value, "evidence concept")
        if evidence_id:
            current = self._fact_ids(f"(live-evidence-fact {artwork_id} {evidence_id} $fid)")
            if not current:
                raise WaziError("That evidence item is not current.")
        else:
            evidence_id = self.knowledge.allocate("evidence")[0]
            current = []
        fact_id = self.knowledge.allocate("fact")[0]
        fresh = fact_evidence(fact_id, artwork_id, evidence_id, concept)
        # Existing evidence notes stay attached to the same evidence id.
        return self._correction_atoms(artwork_id, current, fact_id, fresh, note)

    def _correction_atoms(
        self, artwork_id: str, previous: list[str], new_id: str, fresh: Atom, note: str
    ) -> list[Atom]:
        """Append a correction. Every previous fact id stays in the space as history."""
        challenge_id = self.knowledge.allocate("challenge")[0]
        audit_id = self.knowledge.allocate("audit")[0]
        old = previous[0] if previous else "none"
        atoms: list[Atom] = [link("superseded-by", fact_id, new_id) for fact_id in previous]
        atoms.append(fresh)
        atoms.append(link("challenge", challenge_id, artwork_id, "correct", old, new_id))
        atoms.append(link("audit", audit_id, "challenged", artwork_id, challenge_id))
        if note:
            atoms.append(_note(challenge_id, note))
        return atoms

    def _dispute_atoms(self, artwork_id: str, fact_ids: list[str], note: str) -> list[Atom]:
        challenge_id = self.knowledge.allocate("challenge")[0]
        audit_id = self.knowledge.allocate("audit")[0]
        dispute_ids = self.knowledge.allocate("dispute", len(fact_ids))
        atoms: list[Atom] = [
            link("challenge", challenge_id, artwork_id, "dispute", fact_ids[0], "none")
        ]
        for dispute_id, fact_id in zip(dispute_ids, fact_ids):
            atoms.append(link("dispute", dispute_id, artwork_id, fact_id))
        atoms.append(link("audit", audit_id, "challenged", artwork_id, challenge_id))
        if note:
            atoms.append(_note(challenge_id, note))
        return atoms

    def _commit(self, atoms: list[Atom]) -> None:
        for atom in atoms:
            validate_data_atom(atom)
        for atom in atoms:
            self.knowledge.add(atom)

    @staticmethod
    def _quoted(atom: Atom) -> dict:
        return {"expr": repr(atom), "data": to_data(atom)}

    def _fact_ids(self, expression: str) -> list[str]:
        names = []
        for atom in self.knowledge.query(expression):
            name = atom_symbol(atom)
            if name is None:
                raise WaziError("MeTTa returned an unexpected fact identifier.")
            names.append(name)
        return names

    def _require_known(self, artwork_id: str) -> None:
        if artwork_id not in self._artwork_ids():
            raise NotFoundError(f"No submission is stored for {artwork_id}.")

    def _image_url(self, artwork_id: str) -> str | None:
        """Public path for the stored image. Absence is not an error."""
        name = self._image_name(artwork_id)
        if name is None:
            return None
        return f"/api/uploads/{name}"

    def _image_name(self, artwork_id: str) -> str | None:
        """Read the upload name from the snapshot. Recommendation rules do not."""
        found = None
        for atom in self.knowledge.data_atoms():
            children = expression_children(atom)
            if not children or atom_symbol(children[0]) != "artwork-image" or len(children) != 3:
                continue
            if atom_symbol(children[1]) != artwork_id:
                continue
            name = grounded_text(children[2])
            if name:
                found = name
        return found

    def _artwork_ids(self) -> list[str]:
        names = []
        for atom in self.knowledge.query("(artwork-ids)"):
            if isinstance(atom, SymbolAtom):
                names.append(atom.get_name())
                continue
            children = expression_children(atom)
            if children:
                names.extend(child.get_name() for child in children if isinstance(child, SymbolAtom))
        # unique can still surface the same id once per matching path; show each work once.
        ordered = []
        for name in names:
            if name not in ordered:
                ordered.append(name)
        return ordered

    def _record(self, atom: Atom) -> dict:
        children = expression_children(atom)
        if not children or atom_symbol(children[0]) != "record":
            raise WaziError(f"MeTTa returned an unexpected current fact: {atom}")
        return self._record_body(children, _child_symbol(children, 1), _child_symbol(children, 2), value_index=3)

    @staticmethod
    def _record_body(children: list[Atom], fact_id: str, role: str, value_index: int) -> dict:
        """Read a fact body. History atoms insert a currency symbol before the value."""
        if role == "evidence":
            return {
                "fact_id": fact_id,
                "role": role,
                "evidence_id": _child_symbol(children, value_index),
                "value": _child_symbol(children, value_index + 1),
            }
        if role == "evidence-note":
            return {
                "fact_id": fact_id,
                "role": role,
                "evidence_id": _child_symbol(children, value_index),
                "value": _child_text(children, value_index + 1),
            }
        if role in {"title", "description"}:
            return {"fact_id": fact_id, "role": role, "value": _child_text(children, value_index)}
        return {"fact_id": fact_id, "role": role, "value": _child_symbol(children, value_index)}

    def _revisions(self, artwork_id: str, highlight: str | None) -> list[dict]:
        revisions = []
        for atom in self.knowledge.query(f"(revision-of {artwork_id})"):
            children = expression_children(atom)
            if not children or atom_symbol(children[0]) != "revision":
                raise WaziError(f"MeTTa returned an unexpected revision: {atom}")
            revision_id = _child_symbol(children, 1)
            before = _child_symbol(children, 2)
            after = _child_symbol(children, 3)
            revisions.append(
                {
                    "revision_id": revision_id,
                    "before": before,
                    "after": after,
                    "expr": repr(atom),
                    "latest": revision_id == highlight,
                }
            )
        revisions.sort(key=lambda item: _numeric_suffix(item["revision_id"]))
        if highlight is None and revisions:
            revisions[-1]["latest"] = True
        return revisions

    def _history(self, artwork_id: str) -> list[dict]:
        """Return every stored fact, current and superseded, from MeTTa."""
        items = [self._history_record(atom) for atom in self.knowledge.query(f"(fact-history {artwork_id})")]
        items.sort(key=lambda item: _numeric_suffix(item["fact_id"]))
        return items

    def _history_record(self, atom: Atom) -> dict:
        children = expression_children(atom)
        if not children or atom_symbol(children[0]) != "history":
            raise WaziError(f"MeTTa returned an unexpected fact history: {atom}")
        fact_id = _child_symbol(children, 1)
        role = _child_symbol(children, 2)
        status = _child_symbol(children, 3)
        if status not in {"current", "superseded"}:
            raise WaziError(f"MeTTa returned an unexpected fact currency: {atom}")
        record = self._record_body(children, fact_id, role, value_index=4)
        record["status"] = status
        return record

    def _challenges(self, artwork_id: str) -> list[dict]:
        history = {item["fact_id"]: item for item in self._history(artwork_id)}
        challenges = []
        for atom in self.knowledge.query(f"(challenge-of {artwork_id})"):
            children = expression_children(atom)
            if not children or atom_symbol(children[0]) != "challenge-view":
                raise WaziError(f"MeTTa returned an unexpected challenge: {atom}")
            challenge_id = _child_symbol(children, 1)
            notes = self.knowledge.query(f"(note-of {challenge_id})")
            note = grounded_text(notes[0]) if len(notes) == 1 else ""
            previous_fact = _child_symbol(children, 3)
            new_fact = _child_symbol(children, 4)
            challenges.append(
                {
                    "challenge_id": challenge_id,
                    "action": _child_symbol(children, 2),
                    "previous_fact": previous_fact,
                    "new_fact": new_fact,
                    "previous_value": _stored_value(history, previous_fact),
                    "new_value": _stored_value(history, new_fact),
                    "note": note or "",
                    "expr": repr(atom),
                }
            )
        challenges.sort(key=lambda item: _numeric_suffix(item["challenge_id"]))
        return challenges

    @staticmethod
    def _one_symbol(atoms: list[Atom], label: str) -> str:
        if len(atoms) != 1 or not isinstance(atoms[0], SymbolAtom):
            rendered = ", ".join(repr(atom) for atom in atoms) or "no result"
            raise WaziError(f"Expected one {label} from MeTTa, got {rendered}.")
        return atoms[0].get_name()


def _optional_symbol(value: str, field: str) -> str:
    if value is None:
        return ""
    text = value.strip()
    if not text:
        return ""
    return require_symbol(text, field)


def _optional_permission(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip().lower()
    if not text:
        return None
    token = require_symbol(text, "permission", allow_reserved=True)
    if token not in PERMISSIONS:
        raise WaziError("Permission must be confirmed, missing, disputed, or left blank.")
    return token


def _clean_evidence(item: EvidenceInput) -> tuple[str, str]:
    concept = require_symbol(item.concept, "evidence concept")
    note = clean_text(item.note, "evidence note", limit=500)
    return concept, note


def _note(challenge_id: str, note: str) -> ExpressionAtom:
    return E(S("challenge-note"), sym(challenge_id), text_atom(note))


def _child_symbol(children: list[Atom], index: int) -> str:
    try:
        name = atom_symbol(children[index])
    except IndexError as exc:
        raise WaziError("MeTTa returned an incomplete expression.") from exc
    if name is None:
        raise WaziError("MeTTa returned an unexpected symbol.")
    return name


def _child_text(children: list[Atom], index: int) -> str:
    try:
        text = grounded_text(children[index])
    except IndexError as exc:
        raise WaziError("MeTTa returned an incomplete expression.") from exc
    if text is None:
        raise WaziError("MeTTa returned an unexpected string.")
    return text


def _numeric_suffix(identifier: str) -> int:
    suffix = identifier.rsplit("-", 1)[-1]
    return int(suffix) if suffix.isdigit() else 0


def _stored_value(history: dict, fact_id: str):
    """Value of a stored fact. `none` means the field was not stored yet."""
    if fact_id == "none":
        return None
    item = history.get(fact_id)
    if item is None:
        return None
    return item["value"]
