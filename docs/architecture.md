# WaziArt architecture

WaziArt recommends a next step for a human reviewer of an exhibition submission. The recommendation is one of:

- `recommend_for_review`
- `request_information`
- `human_review`

None of these accepts or rejects the artwork. The fictional exhibition theme is peace.

## Layout

```
metta/core/schema.metta        Exhibition theme, criteria, and evidence vocabulary
metta/rules/review.metta       Presence, permission, theme, and recommendation rules
metta/rules/challenge.metta    Disputes, current facts, and revision comparison
metta/rules/graph.metta        Edges derived from those rules
metta/examples/peace_exhibition.metta
src/waziart/symbols.py         Safe atoms and the snapshot whitelist
src/waziart/runtime.py         Hyperon runner, queries, and snapshot swap
src/waziart/service.py         Submit, challenge, and re-infer
src/waziart/present.py         Sentences for atoms MeTTa already returned
src/waziart/server.py          Local HTML and JSON interface
src/waziart/static/            The accessible review page
tests/                         Reasoning, challenge, persistence, HTTP, and demo tests
```

## What runs in MeTTa

Trusted `.metta` files are loaded with `MeTTa.run`. They define:

- which evidence concepts support `theme-alignment`
- whether a fact is still current or has been superseded
- which required fields are missing
- whether permission is exactly `confirmed`
- whether any current fact is disputed
- the single recommendation
- the explanation items in `(trace ...)`
- the graph edges in `(edge ...)`
- `(outcome-delta Before After)`, which reports whether two inferred recommendations differ

Python checks the shape of input, builds atoms with `E`, `S`, and `ValueAtom`, adds them with `space.add_atom`, and reads the results back. It does not choose the recommendation with its own conditionals.

A failed `match` in Hyperon 0.2.10 produces no result, not `()`. Rules call `collapse` before comparing that result with `()`. `(empty)` drops a branch. `and` takes two arguments, so the readiness test nests it.

## Facts, history, and challenges

A submission is a set of flat data atoms:

```
(fact FactId Artwork title "...")
(fact FactId Artwork permission confirmed)
(fact FactId Artwork evidence EvidenceId reconciliation)
(audit AuditId submitted Artwork Artwork)
```

A correction adds a new fact and `(superseded-by OldFact NewFact)`. The old fact stays in the space. A dispute adds `(dispute DisputeId Artwork FactId)` and leaves the fact current. Recommendation rules ignore a dispute once its fact has been superseded, but the dispute atom remains.

`(outcome-delta ...)` compares the recommendation from before the change with the recommendation from after it. The pair is stored as `(revision-compare ...)`.

## Graph

`!(graph-edge Artwork)` returns edges such as:

```
(edge Artwork has-evidence EvidenceId)
(edge Concept supports theme-alignment)
(edge Criterion evaluated-by Rule)
(edge rule-recommendation derives Recommendation)
(edge ChallengeId corrects OldFact)
(edge RevisionId changes Before After)
```

The page renders that list. It does not ship a separate illustration of the graph.

## Persistence

`KnowledgeBase.save` writes data atoms with MeTTa's atom printer (`repr`, backed by `atom_to_str`). `restore_text` parses that text with `MeTTa.parse_all` and adds the atoms. It does not `run` the file. See `docs/decisions.md` for why `load-ascii` is not used.

Rules are loaded again from the project files on every restore, so a snapshot cannot replace them. The new space replaces the old one only after every atom passes the whitelist. Restoring the same file twice does not append a second copy.

## Interface

`python -m waziart` serves one HTML page. The page submits JSON, then shows the recommendation, the trace, a relationship table, and a challenge form. Status is written in words. The MeTTa expression is shown next to each sentence.

## What the description does not do

No rule reads the description. A trace item says it was recorded as text and was not interpreted. Mentioning "reconciliation" in the paragraph does not support the theme; only an evidence concept listed in `schema.metta` does.
