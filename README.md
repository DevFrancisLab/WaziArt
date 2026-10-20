# WaziArt

**See the Reason. Challenge the Decision.**

WaziArt is an accessibility-first review assistant for a fictional exhibition about peace, reconciliation, and conflict resolution. An artist submits structured facts. MeTTa rules infer one recommendation:

| Symbol | Meaning |
| --- | --- |
| `recommend_for_review` | The required facts align. A person should review the work. |
| `request_information` | Something required was not supplied. |
| `human_review` | A fact is disputed, or the supplied facts do not clearly align. |

These are recommendations to a human reviewer. They are not judgements of artistic worth, and they are not acceptance or rejection.

The description is stored as text. WaziArt does not read it for evidence. Evidence is a concept the artist selects, such as `reconciliation` or `dialogue`.

## Requirements

- Python 3.9.6 (the version used to verify this project)
- `hyperon` 0.2.10, already installed in `venv/`

```bash
source venv/bin/activate
pip install -r requirements.txt
```

## Run the demo

From the repository root:

```bash
source venv/bin/activate
export PYTHONPATH=src
python -m waziart.demo
```

Or `./bin/waziart-demo`. The command submits *Paths to Peace* without permission, submits a disputed memorial, then corrects the missing permission. It prints `request_information`, `human_review`, and the revised `recommend_for_review`.

## Run the interface

```bash
source venv/bin/activate
export PYTHONPATH=src
python -m waziart
```

Or `./bin/waziart`. Open `http://127.0.0.1:8000`.

The page can fill three samples. Submit one, read the recommendation and the MeTTa trace, then challenge a fact. Submissions are written to `data/space.metta` and loaded again on the next start.

Use a keyboard: every control is a button, link, or field, and focus is outlined. The recommendation is named in text. The relationship table is the reasoning graph; color is only an extra cue.

## Test

```bash
source venv/bin/activate
python -m unittest discover -s tests -v
```

The tests load the `.metta` rules, infer each recommendation, show that missing permission is not confirmed, record a challenge that changes the result, rebuild the graph from inferred edges, restore a snapshot after a new process, and reject snapshot text that would be executable MeTTa.

## How a review is inferred

Rules live in `metta/rules/`. In short:

1. A required field that was never stored, or a permission whose value is `missing`, is missing information.
2. Permission counts as confirmed only when the current value is the symbol `confirmed`.
3. A disputed permission, or a dispute that still points at a current fact, needs a person. That path wins even if other fields are blank.
4. Otherwise, if anything required is missing, the recommendation is `request_information`.
5. Otherwise the theme must be `peace`, the permission must be confirmed, and at least one current evidence concept must support `theme-alignment`. All three produce `recommend_for_review`. Anything else is `human_review`.

A correction does not delete the previous fact. It adds `(superseded-by Old New)` and a new fact. The next inference sees only current facts. `(outcome-delta Before After)` records whether the recommendation changed.

Details and the `load-ascii` limitation are in `docs/architecture.md` and `docs/decisions.md`.

## Extend it

- Add a concept by adding `(supports your-concept theme-alignment)` in `metta/core/schema.metta`.
- Add a rule in `metta/rules/` and return a `(trace ...)` item so the page can show it.
- Keep new stored atoms inside the whitelist in `src/waziart/symbols.py`. Do not `run` artist text or snapshot files.
