# Event Tracker

Static Event Tracker for concerts, sports, movies, markets, and Meetup groups.

## Supported Sources

- GOGO SATOSHI
- DEPAPEPE
- Kotaro Oshio (押尾コータロー)
- Seiji Igusa (井草聖二)
- Tatsuya Maruyama (丸山達也)
- バスケットボール日本代表 (SPOCALE)
- 川崎市アートセンター 映像館
- しんゆりフェスティバル・マルシェ
- 庶民のIPO
- 飛地・東京 (Instagram)
- Tokyo Expat Social Club (Meetup)
- Chill Run Crew Tokyo (Meetup)

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3456

API: `GET /api/events` (use `?refresh=1` to force refresh)

`GET /api/concerts` is kept as a compatibility alias.

## Static Site

```bash
npm run generate:static
```

The static site is generated under `site/`, including `api/events.json`.
GitHub Pages serves the repository root, so `index.html` and `api/events.json`
are committed at the root. GitHub Actions refreshes those generated files on
push, manual runs, and a daily schedule.
