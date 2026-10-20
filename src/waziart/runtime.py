"""MeTTa runtime for WaziArt.

Trusted rule files are evaluated with ``MeTTa.run``. Artist submissions and
snapshots are added with ``space.add_atom`` after they have been built or
parsed as data. This module does not decide whether a work is ready for review.
"""

from __future__ import annotations

import re
from pathlib import Path

import hyperon
from hyperon import Atom, Environment, ExpressionAtom, MeTTa, SymbolAtom, atom_is_error

from waziart.errors import SnapshotError, WaziError
from waziart.symbols import decode_snapshot, encode_snapshot, is_data_atom, iter_symbols

REPO_ROOT = Path(__file__).resolve().parents[2]
METTA_ROOT = REPO_ROOT / "metta"
RULE_FILES = (
    "core/schema.metta",
    "rules/review.metta",
    "rules/challenge.metta",
    "rules/graph.metta",
)
REQUIRED_HYPERON = "0.2.10"

# Queries are assembled by this package from tokens it has already checked.
# The pattern leaves no room for a quote, a bang, or a second statement.
_QUERY = re.compile(r"^[a-z0-9_()$ \-_]+$")


class KnowledgeBase:
    """One MeTTa space holding exhibition rules plus submission facts."""

    def __init__(self, snapshot_path: Path | None = None):
        self.snapshot_path = Path(snapshot_path) if snapshot_path is not None else None
        self._ensure_hyperon()
        self.metta = self._new_runner()
        self._check_rules_loaded()
        if self.snapshot_path is not None and self.snapshot_path.exists():
            self.restore_file(self.snapshot_path)

    @staticmethod
    def _ensure_hyperon() -> None:
        version = getattr(hyperon, "__version__", "")
        if version != REQUIRED_HYPERON:
            raise WaziError(
                f"WaziArt was verified with hyperon {REQUIRED_HYPERON}, "
                f"but this environment has {version or 'an unknown version'}."
            )

    def _new_runner(self) -> MeTTa:
        """Load trusted rule files into a fresh runner.

        ``config_dir`` is left unset so startup does not touch a user config
        directory. ``working_dir`` only locates the project's MeTTa sources.
        """
        metta = MeTTa(
            env_builder=Environment.custom_env(working_dir=str(METTA_ROOT))
        )
        for relative in RULE_FILES:
            path = METTA_ROOT / relative
            try:
                source = path.read_text(encoding="utf-8")
            except OSError as exc:
                raise WaziError(f"Could not read {relative}: {exc}") from exc
            self._run_trusted(metta, source, relative)
        return metta

    @staticmethod
    def _run_trusted(metta: MeTTa, source: str, label: str) -> None:
        """Evaluate project-authored MeTTa. Never call this with user input."""
        try:
            results = metta.run(source)
        except (RuntimeError, SyntaxError) as exc:
            raise WaziError(f"Could not load {label}: {exc}") from exc
        for group in results:
            for atom in group:
                if atom_is_error(atom):
                    raise WaziError(f"Could not load {label}: {atom}")

    def _check_rules_loaded(self) -> None:
        themes = self.query("(exhibition)")
        if [self._symbol(atom) for atom in themes] != ["peace"]:
            raise WaziError("The exhibition theme did not load from MeTTa.")
        if not self.query("(evidence-concept)"):
            raise WaziError("Evidence concepts did not load from MeTTa.")

    def query(self, expression: str) -> list[Atom]:
        """Evaluate one parenthesized MeTTa call and return its result atoms.

        ``expression`` must already be a fixed template plus safe symbols.
        It is rejected if it contains anything the template grammar forbids.
        """
        if not isinstance(expression, str) or not _QUERY.fullmatch(expression):
            raise WaziError("Refusing to evaluate a query that is not a safe MeTTa call.")
        if expression.count("(") != expression.count(")"):
            raise WaziError("Refusing to evaluate an unbalanced query.")
        # ``expression`` already includes its parentheses. Wrapping it again
        # would turn a symbol result into a one-element expression.
        try:
            results = self.metta.run(f"!{expression}")
        except (RuntimeError, SyntaxError) as exc:
            raise WaziError(f"MeTTa could not evaluate the query: {exc}") from exc
        atoms: list[Atom] = []
        for group in results:
            for atom in group:
                if atom_is_error(atom):
                    raise WaziError(f"MeTTa returned an error: {atom}")
                atoms.append(atom)
        return atoms

    def add(self, atom: Atom) -> None:
        """Add one validated data atom. The atom is not evaluated."""
        if not is_data_atom(atom):
            raise WaziError("Refusing to add an atom that is not submission data.")
        self.metta.space().add_atom(atom)

    def data_atoms(self) -> list[Atom]:
        """Return stored submission atoms, excluding rule definitions."""
        space = self.metta.space().get_atoms() or []
        return [atom for atom in space if is_data_atom(atom)]

    def allocate(self, prefix: str, count: int = 1) -> list[str]:
        """Mint new ids from the highest numeric suffix already stored.

        Identifiers inside grounded strings are ignored, so a title that
        happens to contain ``fact-99`` cannot move the counter.
        """
        if count < 0 or not is_safe_prefix(prefix):
            raise WaziError("Could not allocate an identifier.")
        if count == 0:
            return []
        highest = 0
        needle = prefix + "-"
        for atom in self.data_atoms():
            for name in iter_symbols(atom):
                if not name.startswith(needle):
                    continue
                suffix = name[len(needle):]
                if suffix.isdigit():
                    highest = max(highest, int(suffix))
        return [f"{prefix}-{highest + offset}" for offset in range(1, count + 1)]

    def save(self) -> None:
        """Write the current data atoms if this knowledge base has a path."""
        if self.snapshot_path is None:
            return
        write_snapshot(self.snapshot_path, self.data_atoms())

    def restore_file(self, path: Path) -> int:
        """Replace submission facts with the contents of ``path``.

        The current space is left untouched when the file is malformed or
        contains an atom the whitelist rejects. Rules are loaded again into
        the replacement space so a snapshot cannot replace them.
        """
        try:
            text = Path(path).read_text(encoding="utf-8")
        except OSError as exc:
            raise SnapshotError(f"Could not read the snapshot: {exc}") from exc
        return self.restore_text(text)

    def restore_text(self, text: str) -> int:
        """Parse ``text`` as data and swap it in only after every atom is valid."""
        fresh = self._new_runner()
        atoms = decode_snapshot(fresh, text)
        for atom in atoms:
            fresh.space().add_atom(atom)
        # Confirm the replacement can still answer a rule query before swapping.
        try:
            themes = _query_with(fresh, "(exhibition)")
        except WaziError as exc:
            raise SnapshotError(str(exc)) from exc
        if [atom.get_name() for atom in themes if isinstance(atom, SymbolAtom)] != ["peace"]:
            raise SnapshotError("The restored space did not keep the exhibition rules.")
        self.metta = fresh
        return len(atoms)

    @staticmethod
    def _symbol(atom: Atom) -> str | None:
        if isinstance(atom, SymbolAtom):
            return atom.get_name()
        return None


def is_safe_prefix(prefix: str) -> bool:
    return bool(re.fullmatch(r"[a-z]+", prefix))


def write_snapshot(path: Path, atoms: list[Atom]) -> None:
    """Atomically replace a snapshot file with the canonical atom text."""
    path = Path(path)
    payload = encode_snapshot(atoms)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(path)


def _query_with(metta: MeTTa, expression: str) -> list[Atom]:
    results = metta.run(f"!{expression}")
    atoms: list[Atom] = []
    for group in results:
        for atom in group:
            if atom_is_error(atom):
                raise WaziError(f"MeTTa returned an error: {atom}")
            atoms.append(atom)
    return atoms


def atom_symbol(atom: Atom) -> str | None:
    """Return a symbol name, including the head of a one-symbol result."""
    if isinstance(atom, SymbolAtom):
        return atom.get_name()
    return None


def expression_children(atom: Atom) -> list[Atom] | None:
    if isinstance(atom, ExpressionAtom):
        return atom.get_children()
    return None
