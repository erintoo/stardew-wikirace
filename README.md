# Stardew WikiRace

A WikiRace-style game built on the [Stardew Valley Wiki](https://stardewvalleywiki.com)'s
MediaWiki API. Get from a random start article to a target article by clicking links —
single-player against the clock, or head-to-head in real time.

## Status

**Phase 0 (data pipeline) — crawler written, not yet run against the live wiki
from this environment** (the sandbox that generated this code can't reach
stardewvalleywiki.com — you'll need to run the crawl yourself).

## Requirements

- Node.js >= 18 (uses the built-in `fetch`, no extra HTTP dependency)

## Setup

```bash
npm install   # nothing to install yet at Phase 0, but keeps this future-proof
npm run crawl
```

This will:

1. Fetch every real article title in the main namespace (`action=query&list=allpages`).
2. Fetch every redirect title and resolve it to its real target
   (so a link to `Cauliflower` that redirects to `Cauliflower (item)` counts
   as an edge to `Cauliflower (item)`, not a dead end).
3. For every real article, fetch its rendered HTML _and_ its outgoing links
   in a single `action=parse` call.
4. Filter links down to ones that land on another real article in our set
   (drops redlinks, external links, Category:/File:/Modding: pages, etc.).
5. Write three files to `data/`:
   - `graph.json` — adjacency list: `{ "Page Title": ["Linked Page", ...], ... }`
   - `pages.json` — `{ "Page Title": "<rendered HTML>", ... }`
   - `redirects.json` — the resolved redirect map, kept for debugging/reference

The crawl is polite by design: capped concurrency (4 in-flight requests),
a small delay between requests, and a descriptive `User-Agent`. Expect it to
take a few minutes — the wiki has several hundred articles. Config knobs
(concurrency, delay, batch sizes) live in `src/crawler/config.js`.

## Design decisions worth knowing about

- **Namespace filtering**: only namespace 0 (articles) is crawled. Talk,
  Category, File, and Modding: pages are excluded — they'd add noise to the
  game graph and aren't the "wiki content" the game is about.
- **Redirects are resolved, not treated as extra nodes.** A redirect isn't a
  real article, so it doesn't appear in `graph.json` as a node — links to it
  are rewritten to point at its target instead.
- **Self-loops and dangling links are dropped.** If a page links to itself,
  or to something outside our crawled page set, that edge is discarded.

## Frontend/backend contract

The browser expects the backend to serve the following same-origin endpoints
under `/api`:

- `GET /pages` returns `{ "titles": ["Page title", ...] }`.
- `GET /articles?title=...` returns `{ "title": "Canonical title", "html": "..." }`.
  The backend must sanitize the rendered article HTML before returning it.
- `POST /rooms` with `{ "playerName": "..." }` creates a room.
- `POST /rooms/:roomCode/join` with `{ "playerName": "..." }` joins a room.
- `POST /rooms/:roomCode/start` with
  `{ "playerId": "...", "startPage": "...", "targetPage": "..." }` starts it.
- `POST /rooms/:roomCode/moves` with
  `{ "playerId": "...", "destination": "..." }` submits a move.

Create and join return `{ "playerId": "...", "state": { ... } }`. The room
state shape is:

```json
{
  "roomCode": "ABCD",
  "status": "lobby",
  "hostPlayerId": "player-id",
  "startPage": null,
  "targetPage": null,
  "winnerPlayerId": null,
  "players": [
    { "id": "player-id", "name": "Farmer", "currentPage": null, "clicks": 0 }
  ]
}
```

`status` is `lobby`, `playing`, or `finished`; `winnerPlayerId` is set when
there is a winner. Start and move responses return `{ "state": { ... } }`.
Errors return `{ "error": "Readable error message" }`.

For live updates, the browser opens
`ws(s)://<host>/api/rooms/:roomCode/events?playerId=...`. The backend should
broadcast `{ "type": "room_state", "state": { ... } }` whenever the room
changes. The server remains authoritative: it validates the start request and
each submitted move against the crawler's link graph.

## Next steps

- `src/graph/bfs.js` — shortest-path / reachability check over `graph.json`,
  used both for picking valid start/end pairs and for scoring runs.
- Sanitize crawler-rendered HTML before serving it through the backend.
- Backend implementation of the frontend API contract above.

See the project plan in the conversation this repo came from for the full
phased breakdown.
