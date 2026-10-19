# Aacharya V7 combined edition — 7.1.0

One integrated academy application: original V7 tuition manager, Chemistry Practice Lab, V2 monthly fee review, and external durable storage for Render Free. Existing V7 records and workflows remain authoritative.

**Read CLOUD_SETUP.md before deploying.** `npm start` uses Supabase cloud storage and deliberately refuses to start until it is configured and initialized. `npm run start:local` retains the original SQLite mode for a computer or paid persistent disk.

Keep V6.1 and previous V7 folders unchanged. Extract this release as a new sibling folder or new branch. Set the Render Root Directory to the actual new project folder. The supplied YAML uses `aacharya-student-intake-render-v7`; change it if your sibling folder has another name.

- `/`: admissions; `/admin`, `/teacher`, `/student`, `/parent`: integrated portals.
- `/chemistry`: account-linked Class 11/12 practice.
- Admin header → **Review monthly fees**: review hours and confirm a charge in the existing fee ledger.
- Admin → Data Safety Center: integrity, complete backup downloads, cloud revision history.

See COMBINED_FEATURE_GUIDE.md for integration scope and QA_COMBINED.md for tests and limits. Original QA documents describe earlier releases; CLOUD_SETUP.md supersedes their Render hosting instructions.
