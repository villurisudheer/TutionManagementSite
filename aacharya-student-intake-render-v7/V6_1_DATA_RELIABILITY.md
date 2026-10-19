# V6.1 Data Reliability & Recovery

## Why V6.1 exists

V6 could successfully accept an admission, but acceptance was not treated as one atomic/idempotent operation. It also still had a physical Student delete path; because several child tables used cascading foreign keys, a student deletion could remove linked operational records. Separately, SQLite cannot survive a Render restart/redeploy if its `DATA_DIR` is on temporary storage.

V6.1 addresses all three classes of risk.

## 1. Accepted admissions do not disappear

Acceptance now uses a database transaction:

```text
Find intake
→ find/reuse linked student if one exists
→ otherwise create student
→ mark intake Accepted + store accepted_student_id
→ COMMIT
→ rebuild reports / generate parent invitation
```

The parent invitation is deliberately outside the acceptance transaction. If invitation creation fails, the student/admission acceptance remains saved.

Repeating Accept is safe: V6.1 reuses the existing linked student.

## 2. Startup self-repair

At every startup V6.1 checks:

- Accepted admission has an existing linked student.
- A student that came from an intake is linked back to that intake.
- Accepted status and accepted student ID agree.

When possible it relinks automatically. If an Accepted intake survived but its student row did not, V6.1 recreates that student from the intake information.

Admin can rerun the check manually from **Settings & Excel → Check / Repair Admissions**.

## 3. Student Archive replaces destructive delete

Student removal from the UI now sets:

```text
status = Inactive
archived_at = timestamp
archive_reason = administrator archive
```

It does not delete the student row and therefore does not cascade through classes, attendance, fees or tests. Use **Reactivate** to return the student to Active.

## 4. SQLite durability

V6.1 enables:

```text
foreign_keys = ON
journal_mode = WAL
synchronous = FULL
busy_timeout = 5000 ms
wal_autocheckpoint = 500
```

After data-changing operations, it schedules a compact SQLite snapshot using SQLite's `VACUUM INTO` mechanism.

Snapshots are stored in:

```text
DATA_DIR/backups/
```

The newest 20 are kept by default. Change with `DB_BACKUP_KEEP`.

If the main DB file is absent at startup but snapshots are still present, V6.1 restores the latest snapshot before opening SQLite.

## 5. Data Safety panel

Admin → Settings & Excel shows:

- SQLite integrity result
- Persistent disk detection
- backup count/latest backup
- Students count
- Admissions count
- Classes count
- Payments count
- Accepted admissions count
- broken accepted-admission links

Actions:

- **Create Safety Snapshot**
- **Check / Repair Admissions**
- **Download Database Backup**

## 6. Render limitation

Rolling snapshots are protection against application mistakes and local DB damage **only while the storage itself survives**.

If Render's filesystem is temporary, this can disappear together:

```text
aacharya_tuition.sqlite
backups/
payment proofs
Excel workbook
```

Therefore production should show:

```text
persistentDiskDetected: true
```

with `DATA_DIR=/var/data` and a persistent disk actually mounted there. If it says false, download a backup and fix storage before relying on the service for long-term records.
