"""Safe atom construction and the snapshot whitelist.

User text is never concatenated into a MeTTa program. Symbols are checked
against a token grammar, and prose is wrapped in a grounded string atom.
A snapshot is accepted only when every atom matches a data predicate.
"""

from __future__ import annotations

import re
from typing import Iterable

from hyperon import E, ExpressionAtom, GroundedAtom, S, SymbolAtom, ValueAtom, Atom

from waziart.errors import SnapshotError, WaziError
from waziart.images import IMAGE_NAME

# Lowercase tokens only, so a snapshot cannot smuggle MeTTa's True/False
# literals or an uppercase operator. Underscores appear in recommendation
# names such as recommend_for_review; hyphens appear in evidence concepts.
_SYMBOL = re.compile(r"^[a-z][a-z0-9]*([_-][a-z0-9]+)*$")

PERMISSIONS = ("confirmed", "missing", "disputed")
RECOMMENDATIONS = ("recommend_for_review", "request_information", "human_review")
ACTIONS = ("correct", "dispute")
AUDIT_KINDS = ("submitted", "challenged", "revised")
TEXT_ROLES = ("title", "description")
SYMBOL_ROLES = ("theme", "permission")

# Heads that would be meaningful if someone later ran the snapshot as code.
# They are rejected as predicates. `=` is also rejected because it is not
# in DATA_PREDICATES; this set covers the children we refuse to mint.
RESERVED_TOKENS = frozenset(
    {
        "and",
        "case",
        "collapse",
        "criterion",
        "edge",
        "empty",
        "fact",
        "false",
        "if",
        "let",
        "match",
        "none",
        "not",
        "or",
        "recommendation",
        "rule",
        "superpose",
        "supports",
        "trace",
        "true",
    }
)

MAX_TEXT = 4000
MAX_SNAPSHOT_ATOMS = 5000
MAX_SNAPSHOT_BYTES = 1_000_000

DATA_PREDICATES = frozenset(
    {
        "fact",
        "superseded-by",
        "challenge",
        "challenge-note",
        "dispute",
        "audit",
        "revision-compare",
        "artwork-image",
    }
)


def is_safe_symbol(value: str) -> bool:
    """Return True when value can be stored as a MeTTa symbol we minted or checked."""
    return bool(_SYMBOL.fullmatch(value))


def require_symbol(value: str, field: str, *, allow_reserved: bool = False) -> str:
    """Validate a caller-supplied token. Blank is rejected."""
    if not isinstance(value, str):
        raise WaziError(f"{field} must be text.")
    token = value.strip().lower()
    if not is_safe_symbol(token):
        raise WaziError(
            f"{field} must be a short lowercase token such as peace or community-repair."
        )
    if not allow_reserved and token in RESERVED_TOKENS:
        raise WaziError(f"{field} uses a reserved token.")
    return token


def clean_text(value: str, field: str, limit: int = MAX_TEXT) -> str:
    """Strip prose and reject values that cannot be stored as grounded strings."""
    if not isinstance(value, str):
        raise WaziError(f"{field} must be text.")
    if "\x00" in value:
        raise WaziError(f"{field} contains a null character.")
    text = value.strip()
    if len(text) > limit:
        raise WaziError(f"{field} is longer than {limit} characters.")
    return text


def sym(name: str) -> SymbolAtom:
    """Build a symbol atom from a token that has already been validated."""
    if not is_safe_symbol(name):
        raise WaziError(f"Refusing to build a symbol from {name!r}.")
    return S(name)


def text_atom(value: str) -> GroundedAtom:
    """Build a grounded string. The string is data, not a program."""
    if not isinstance(value, str) or "\x00" in value or len(value) > MAX_TEXT:
        raise WaziError("Refusing to store this text.")
    return ValueAtom(value)


def grounded_text(atom: Atom) -> str | None:
    """Return the Python string inside a grounded string atom, if it is one."""
    if not isinstance(atom, GroundedAtom):
        return None
    try:
        obj = atom.get_object()
    except (TypeError, RuntimeError):
        return None
    if isinstance(obj, str):
        return obj
    content = getattr(obj, "content", None)
    if isinstance(content, str):
        return content
    return None


def _symbol_name(atom: Atom) -> str | None:
    if isinstance(atom, SymbolAtom):
        name = atom.get_name()
        if is_safe_symbol(name):
            return name
    return None


def _expect_symbol(atom: Atom, field: str) -> str:
    name = _symbol_name(atom)
    if name is None:
        raise SnapshotError(f"{field} is not a safe symbol.")
    return name


def _expect_text(atom: Atom, field: str) -> str:
    text = grounded_text(atom)
    if text is None or "\x00" in text or len(text) > MAX_TEXT:
        raise SnapshotError(f"{field} is not a grounded string.")
    return text


def validate_data_atom(atom: Atom) -> None:
    """Raise SnapshotError unless atom is one whitelisted data expression.

    Nested expressions, variables, and grounded operations are rejected.
    A string is allowed only in a prose position, so it cannot become code
    when the snapshot is loaded.
    """
    if not isinstance(atom, ExpressionAtom):
        raise SnapshotError("A snapshot atom must be an expression.")
    children = atom.get_children()
    if not children:
        raise SnapshotError("A snapshot atom is empty.")
    predicate = _expect_symbol(children[0], "predicate")
    if predicate not in DATA_PREDICATES:
        raise SnapshotError(f"Predicate {predicate} cannot be stored.")

    if predicate == "fact":
        _validate_fact(children)
    elif predicate == "superseded-by":
        _symbols(children, 3)
    elif predicate == "challenge":
        names = _symbols(children, 6)
        if names[3] not in ACTIONS:
            raise SnapshotError("A challenge action is not correct or dispute.")
    elif predicate == "challenge-note":
        if len(children) != 3:
            raise SnapshotError("A challenge note has the wrong shape.")
        _expect_symbol(children[1], "challenge id")
        _expect_text(children[2], "challenge note")
    elif predicate == "dispute":
        _symbols(children, 4)
    elif predicate == "audit":
        names = _symbols(children, 5)
        if names[2] not in AUDIT_KINDS:
            raise SnapshotError("An audit event has an unknown kind.")
    elif predicate == "revision-compare":
        names = _symbols(children, 5)
        if names[3] not in RECOMMENDATIONS or names[4] not in RECOMMENDATIONS:
            raise SnapshotError("A revision does not name recommendation symbols.")
    elif predicate == "artwork-image":
        if len(children) != 3:
            raise SnapshotError("An artwork image has the wrong shape.")
        _expect_symbol(children[1], "artwork id")
        filename = _expect_text(children[2], "image reference")
        if not IMAGE_NAME.fullmatch(filename):
            raise SnapshotError("An artwork image reference is not a stored upload name.")
    else:
        raise SnapshotError(f"Predicate {predicate} cannot be stored.")


def _symbols(children: list, count: int) -> list[str]:
    if len(children) != count:
        raise SnapshotError("A snapshot atom has the wrong number of arguments.")
    return [_expect_symbol(child, "argument") for child in children]


def _validate_fact(children: list) -> None:
    if len(children) not in (5, 6):
        raise SnapshotError("A fact has the wrong shape.")
    role = _expect_symbol(children[3], "fact role")
    _expect_symbol(children[1], "fact id")
    _expect_symbol(children[2], "artwork id")
    if role in TEXT_ROLES:
        if len(children) != 5:
            raise SnapshotError(f"A {role} fact has the wrong shape.")
        _expect_text(children[4], role)
        return
    if role == "theme":
        if len(children) != 5:
            raise SnapshotError("A theme fact has the wrong shape.")
        _expect_symbol(children[4], "theme")
        return
    if role == "permission":
        if len(children) != 5:
            raise SnapshotError("A permission fact has the wrong shape.")
        status = _expect_symbol(children[4], "permission")
        if status not in PERMISSIONS:
            raise SnapshotError("A permission fact has an unknown status.")
        return
    if role == "evidence":
        if len(children) != 6:
            raise SnapshotError("An evidence fact has the wrong shape.")
        _expect_symbol(children[4], "evidence id")
        _expect_symbol(children[5], "evidence concept")
        return
    if role == "evidence-note":
        if len(children) != 6:
            raise SnapshotError("An evidence note has the wrong shape.")
        _expect_symbol(children[4], "evidence id")
        _expect_text(children[5], "evidence note")
        return
    raise SnapshotError(f"Fact role {role} is not allowed.")


def is_data_atom(atom: Atom) -> bool:
    """Return True for atoms the snapshot is allowed to contain."""
    try:
        validate_data_atom(atom)
    except SnapshotError:
        return False
    return True


def fact_text(fact_id: str, artwork_id: str, role: str, text: str) -> ExpressionAtom:
    """A prose fact. `text` is stored as a grounded string, never parsed."""
    if role not in TEXT_ROLES:
        raise WaziError(f"{role} is not a prose field.")
    return E(S("fact"), sym(fact_id), sym(artwork_id), sym(role), text_atom(text))


def fact_symbol(fact_id: str, artwork_id: str, role: str, value: str) -> ExpressionAtom:
    """A symbolic fact such as theme or permission."""
    if role not in SYMBOL_ROLES:
        raise WaziError(f"{role} is not a symbolic field.")
    if role == "permission" and value not in PERMISSIONS:
        raise WaziError("Permission must be confirmed, missing, or disputed.")
    return E(S("fact"), sym(fact_id), sym(artwork_id), sym(role), sym(value))


def fact_evidence(fact_id: str, artwork_id: str, evidence_id: str, concept: str) -> ExpressionAtom:
    """An artist-supplied evidence concept."""
    return E(
        S("fact"),
        sym(fact_id),
        sym(artwork_id),
        S("evidence"),
        sym(evidence_id),
        sym(concept),
    )


def fact_note(fact_id: str, artwork_id: str, evidence_id: str, note: str) -> ExpressionAtom:
    """Prose attached to one evidence item. It is not itself a concept."""
    return E(
        S("fact"),
        sym(fact_id),
        sym(artwork_id),
        S("evidence-note"),
        sym(evidence_id),
        text_atom(note),
    )


def image_reference(artwork_id: str, filename: str) -> ExpressionAtom:
    """A stored upload name. The bytes are not an atom and not evidence."""
    if not IMAGE_NAME.fullmatch(filename):
        raise WaziError("Refusing to store an image reference that is not a saved upload name.")
    return E(S("artwork-image"), sym(artwork_id), text_atom(filename))


def link(predicate: str, *names: str) -> ExpressionAtom:
    """A symbolic data atom whose every argument is a safe symbol."""
    if predicate not in DATA_PREDICATES or predicate == "fact":
        raise WaziError(f"Cannot build a {predicate} atom.")
    return E(S(predicate), *(sym(name) for name in names))


def to_data(atom: Atom) -> dict:
    """Convert an inference result into JSON-friendly data without changing it."""
    if isinstance(atom, SymbolAtom):
        return {"kind": "symbol", "value": atom.get_name()}
    text = grounded_text(atom)
    if text is not None:
        return {"kind": "string", "value": text}
    if isinstance(atom, ExpressionAtom):
        return {"kind": "expr", "children": [to_data(child) for child in atom.get_children()]}
    return {"kind": "other", "value": repr(atom)}


def iter_symbols(atom: Atom) -> Iterable[str]:
    """Yield symbol names inside an expression. String contents are not scanned."""
    if isinstance(atom, SymbolAtom):
        yield atom.get_name()
        return
    if isinstance(atom, ExpressionAtom):
        for child in atom.get_children():
            yield from iter_symbols(child)


def encode_snapshot(atoms: Iterable[Atom]) -> str:
    """Serialize data atoms with MeTTa's own atom printer.

    The result is a sequence of S-expressions. Callers must not pass rule
    atoms; those are reloaded from the trusted `.metta` sources.
    """
    unique: list[str] = []
    seen: set[str] = set()
    for atom in atoms:
        validate_data_atom(atom)
        rendered = repr(atom)
        if rendered in seen:
            continue
        seen.add(rendered)
        unique.append(rendered)
    unique.sort()
    body = "\n".join(unique)
    header = (
        "; WaziArt snapshot\n"
        "; Data atoms only. Load them by parsing; do not evaluate this file.\n"
    )
    return header + (body + "\n" if body else "")


def decode_snapshot(metta, text: str) -> list[Atom]:
    """Parse a snapshot into atoms without evaluating it.

    `metta.parse_all` uses the S-expression parser only. A `!` prefix or an
    equality rule is therefore just another atom, and the whitelist rejects it.
    Identical atoms are returned once so a repeated line cannot duplicate facts.
    """
    if not isinstance(text, str):
        raise SnapshotError("A snapshot must be text.")
    if len(text.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        raise SnapshotError("The snapshot is too large.")
    try:
        parsed = metta.parse_all(text)
    except SyntaxError as exc:
        raise SnapshotError(f"The snapshot is malformed: {exc}") from exc
    except Exception as exc:
        raise SnapshotError(f"The snapshot could not be parsed: {exc}") from exc

    if len(parsed) > MAX_SNAPSHOT_ATOMS:
        raise SnapshotError("The snapshot has too many atoms.")

    unique: list[Atom] = []
    seen: set[str] = set()
    for atom in parsed:
        validate_data_atom(atom)
        rendered = repr(atom)
        if rendered in seen:
            continue
        seen.add(rendered)
        unique.append(atom)
    return unique
