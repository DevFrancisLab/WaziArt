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

A simple explanation can optionally restate that MeTTa result in plain language. It uses Qwen through Groq and is not the source of the recommendation. Review, upload, and correction work with no API key and no network call to Groq. Put the key in the ignored `.env` file at the repository root:

```bash
GROQ_API_KEY=your-key
GROQ_MODEL=qwen/qwen3.8-27b
```

`GROQ_MODEL` is optional. The default is `qwen/qwen3.8-27b`. The key stays on the Python process. The browser asks `POST /api/artworks/{id}/explanation` only after **Explain simply**. If Groq is missing or rejects the request, the MeTTa recommendation and its detailed reasoning stay on screen. The model cannot change facts, challenges, or the recommendation.

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

Or `./bin/waziart`. Open `http://127.0.0.1:8000` for the original static page. Submissions are written to `data/space.metta` and loaded again on the next start.

## React interface

The review workflow also runs as a React application in `frontend/`. It talks to the same API. Start the API as above, then in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to port 8000.

`./bin/waziart-dev` starts both. Node.js 20 or newer is required. See `frontend/README.md` for the production build. `python -m waziart` does not serve the React build.

The screen starts centered, with no artwork selected. **Upload artwork** opens the submission form over the page. **Submissions** opens the saved works. Choosing one shows its image, when one was stored, and the MeTTa recommendation. **See reasoning** opens the trace, the rules named in that trace, relationships, facts, and history. **Explain simply** is a separate request for a short Qwen restatement. A correction is not saved until you confirm it.

To rehearse without writing to `data/space.metta`, point the API at another snapshot and the dev server at that API:

```bash
python -m waziart --host 127.0.0.1 --port 8794 --data /tmp/waziart-recording/space.metta
```

```bash
cd frontend
WAZIART_API=http://127.0.0.1:8794 npx vite --port 5176 --strictPort --host 127.0.0.1
```

Use a keyboard: every control is a button, link, or field, and focus is outlined. The recommendation is named in text. The relationship table is the reasoning graph; color is only an extra cue.

## Test

```bash
source venv/bin/activate
python -m unittest discover -s tests -v
```

The tests load the `.metta` rules, infer each recommendation, show that missing permission is not confirmed, record a challenge that changes the result, keep superseded facts visible through `(fact-history ...)`, rebuild the graph from inferred edges, restore a snapshot after a new process, and reject snapshot text that would be executable MeTTa. Explanation tests mock the Groq response. They do not need an API key.

Frontend tests, from `frontend/` after `npm install`:

```bash
npm test
```

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
