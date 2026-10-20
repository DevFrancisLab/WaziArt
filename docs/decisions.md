# Decisions and limits

Verified with CPython 3.9.6 and `hyperon` 0.2.10 from the project virtualenv.

## MeTTa is the decision procedure

The three recommendation symbols are returned by `(recommendation Artwork)`. Python rejects a result that is not one of those three symbols, because that means the rules failed their contract. It does not substitute a verdict of its own.

Explanation text in `present.py` is a reading of a `(trace ...)` atom. If a new trace shape appears, the page shows the MeTTa expression unchanged.

## `load-ascii` is available and not used

Hyperon 0.2.10 exposes `hyperonpy.load_ascii` and a `load-ascii` operation. A direct experiment on this machine showed that it is not a safe snapshot format:

- `(unclosed` was accepted and did not raise.
- `!(+ 1 41)` was not executed, but `+` and `41` were inserted as atoms.
- `(note art-ascii "hello (world)")` came back with an extra space inside the string.
- Loading the same file twice duplicated the atoms.

The snapshot format is therefore the canonical S-expression printed for each data atom. On load, `parse_all` only parses. A whitelist then requires every atom to be a `fact`, `superseded-by`, `challenge`, `challenge-note`, `dispute`, `audit`, `revision-compare`, or `artwork-image`, with symbols and grounded strings in fixed positions. An `artwork-image` atom stores only the generated upload filename. The image bytes stay in `data/uploads/` and are not evidence. Nested expressions, variables, and equality rules are rejected, and nothing is added unless the whole file passes.

User prose is wrapped with `ValueAtom`. It is never interpolated into a program string. Queries accept only a checked token grammar, so an artwork id cannot close the expression and start another one.

## Currency of facts

Hyperon 0.2.10 cannot ask "there is no matching atom" by matching. `(collapse (match ...))` turns no match into `()`, and a match into a tuple. `is-superseded` uses that. Current values are facts whose collapse is `()`. Superseded facts remain queryable as history.

## One exhibition

The theme symbol `peace` and the six supporting concepts live in `metta/core/schema.metta`. Another exhibition means editing those facts and the tests, not adding a database.

## No external services

There is no SQL database, graph database, LLM client, API key, or WhatsApp integration. The only dependency is `hyperon==0.2.10`. The interface is the Python standard-library HTTP server.

## Fact history is a query, not a second decision

`(fact-history Artwork)` lists stored facts and whether each one is still current. The React page uses it to show a value that a correction replaced. The recommendation function does not call it.

## Persistence claim

Restart-and-restore is covered by `tests/test_persistence.py`: a new `ReviewService` on the same file sees the challenge, a repeated restore does not duplicate atoms, a malformed file leaves the previous space in place, and a snapshot that contains `!(...)` or `(= ...)` is refused. The running server stores that file at `data/space.metta`, which is gitignored.
