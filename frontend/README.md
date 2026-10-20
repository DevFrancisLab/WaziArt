# WaziArt React frontend

The browser interface for WaziArt. It collects a submission, shows the recommendation returned by the Python API, and sends challenges back to that API. MeTTa decides the recommendation. This app does not.

## Requirements

- Node.js 20 or newer, with npm
- The Python API from the repository root, normally on `http://127.0.0.1:8000`

This Mac image did not have Node on `PATH`. Node 20.19.5 for macOS 12 (Intel) can be unpacked into `.tools/node` at the repository root. That directory is gitignored. `bin/waziart-dev` uses it when `node` is not already installed. A normal install from [nodejs.org](https://nodejs.org/) is the other option. Do not replace the system Python.

## Install

```bash
cd frontend
npm install
```

## Development

Terminal 1, from the repository root:

```bash
source venv/bin/activate
export PYTHONPATH=src
python -m waziart
```

That listens on `http://127.0.0.1:8000` and stores submissions in `data/space.metta`.

Terminal 2:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to port 8000.

Both processes together:

```bash
./bin/waziart-dev
```

## Tests and production build

```bash
cd frontend
npm test
npm run build
npm run preview
```

`npm test` uses Vitest and Testing Library. It stubs `fetch` and checks that the screen shows the payload it was given.

`npm run build` writes `frontend/dist`. `npm run preview` serves that build and still proxies `/api` to port 8000.

The Python command `python -m waziart` still serves the original static page at port 8000. It does not serve `frontend/dist`. Opening the built files directly will not reach the API. Use `npm run preview`, or host `frontend/dist` behind a proxy that forwards `/api` to the Python process.

## What the screen shows

- The recommendation symbol, label, and status sentence from the API
- The MeTTa trace and a node-link drawing of the returned edges
- The same edges as a table, which is the keyboard-accessible view
- Challenge notes, previous and corrected values, and superseded facts from `history`
- Revision records with the before and after symbols

`evaluated-by` edges are exhibition criteria. The other edges belong to the current review.

The open artwork is stored in the page address as `?artwork=`. Reloading the page asks the API for that review again. An empty list shows no sample artwork.

A new submission includes an artwork image. The file is sent as multipart form data and saved under `data/uploads/` with a generated name. MeTTa stores that name, not the image bytes, and the picture is not treated as evidence. Artworks stored earlier without an image still open. The image URL is `/api/uploads/<name>`, which Vite proxies with the rest of `/api`.

A correction is not saved until you confirm it. Confirm sends the existing challenge request.

**See reasoning** opens the MeTTa trace, the rules named in that trace, relationships, facts, and history. **Explain simply** asks the Python API for a short Qwen restatement of that same result. The request is not sent when an artwork opens. If Groq is unconfigured or fails, the MeTTa review stays on screen. The API key is not part of the frontend.
