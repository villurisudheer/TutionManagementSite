# AACHARYA LEARNING ACADEMY — Tuition Manager V7

V7 extends the authoritative V6.1 project. It keeps one Node web service, vanilla HTML/CSS/JavaScript, the supplied Express-compatible HTTP layer, the same persistent SQLite database, the original PNG logo and the proven dependency-free XLSX writer. No production runtime dependencies were added.

Start with **START_HERE.md**. This ZIP contains the entire V7 project; no manual patch merging is needed.

## Data model and compatibility

- Permanent student identity, multiple enrollment IDs, permanent accepted-admission history, transactional/idempotent acceptance and recovery of missing links.
- Additive migration version 7, verified pre-migration snapshot, WAL with FULL synchronous writes, safe request transactions and optional `Idempotency-Key` retry protection.
- Archive/reactivate for students and management records. Cancelled/reversed/refunded payments remain stored; edits preserve the previous version and proof history.
- Unified per-class attendance without removing V6.1 daily attendance history. Batch sessions create student-level class rows with one shared session key; teacher hours count a shared session once.
- Parent accounts, student links, invitation history and proof files remain on the same persistent disk. Manual account disables stay disabled. Historical credentials are no longer automatically purged.

The old `parent-portal-extension/` sources and prior release documentation are retained for traceability. They are not required or started by V7. The legacy remote payment-write endpoint returns 410 so it cannot bypass integrated proof verification.

## Run locally

Use Node 24. Copy `.env.example` to `.env` and fill in private admin credentials and a random session secret. For example, generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store it only in your environment file.

```sh
npm ci --omit=dev
npm start
```

The port is `process.env.PORT || 3000`. Local data defaults to `./data`. Production upgrades use `/var/data/aacharya_tuition.sqlite`. New production installations, with a genuinely new empty disk, additionally require `INIT_NEW_DATABASE=true` for their first start; remove that flag afterwards.

## Tests

```sh
npm test
```

The automated suite copies an artificial V6.1 database fixture into a temporary directory. It never uses your `DATA_DIR`. Browser testing is a separate development gate using Playwright and Chromium. Independent workbook validation uses Python/openpyxl. Neither is needed on Render. See QA_V7.md for exact commands and successful checks.

## Project map

| Location | Purpose |
|---|---|
| `server.js` | Original server, compatibility routes, SQLite initialization and preserved master export |
| `lib/mini-express.js` | Supplied HTTP framework with focused route/security fixes |
| `lib/xlsx-safe.js` | Original unchanged safe XLSX writer |
| `integration/integrated-parent-portal.js` | Original integrated portal and compatibility data model |
| `v7/` | Additive migrations, roles, safety, finance, academics, reports and portals |
| `public/v7-*.js`, `public/v7.css` | Additive admin/portal interface and print support |
| `scripts/` | Baseline and V7 test tools; artificial compatibility fixture |
| `V6.1_BASELINE_MANIFEST.json` | SHA-256 file inventory of the authoritative baseline |

All API calls in the public frontend are relative. Private files are served only by authorized API routes. Exported databases, spreadsheets and complete backups contain private academy data and should be stored privately.
