# Aacharya Parent Portal Extension 1.0

A separate Render service that extends **Aacharya Tuition Manager v3** without turning the parent portal into a second tuition manager.

## What stays in the main tuition manager

- Students and accepted admissions
- Classes
- Attendance
- Fees
- Official / verified payments
- Tests
- Main Excel workbook
- Admin operations

## What this extension owns

- Parent accounts and password hashes
- Parent ↔ child links
- One-time invitation links
- Course enrollments / end dates
- 7-day course-ending warning
- 7-day post-course grace period
- Renewal requests
- Payment-proof screenshots and verification status
- Parent portal notifications

## URLs after deployment

- Parent portal: `https://YOUR-PARENT-PORTAL.onrender.com/parent`
- Invitation signup: generated as `/signup?invite=...`
- Extension admin: `https://YOUR-PARENT-PORTAL.onrender.com/extension-admin`
- Health check: `/api/health`

## Parent flow

1. Student/parent submits the normal admission form in the **main manager**.
2. Admin accepts admission in the main manager.
3. The small parent-portal bridge notifies this extension.
4. The extension creates a one-time parent invitation.
5. Admin copies the invitation from **Extension Admin → Students & Invites**. If the original automatic invite URL was not captured, click **Generate / Replace Invite**.
6. Parent opens the invite, creates an account, and becomes linked only to that student.
7. Parent sees live classes, attendance, fees, verified payments and tests from the main manager.

If the hook fails because one service is temporarily down, **Extension Admin → Sync Accepted Admissions** recovers accepted students from the main manager.

## Course lifecycle

Each student needs an Enrollment in the extension:

- course name
- start date
- end date

The extension calculates a grace-until date automatically.

Lifecycle:

`Upcoming → Active → Grace → Ended`

- 7 days before course end: parent receives a **Course ending soon** notice.
- Course end through `COURSE_GRACE_DAYS` (default 7): parent remains able to use the portal and apply for the next course.
- If a renewal request is pending, account closure is paused.
- If every linked child's enrollment has ended and there is no pending renewal, the parent account is **Disabled**.
- After `CREDENTIAL_PURGE_DAYS` (default 30), login credentials are purged/anonymized. Historical student/payment links remain intact.

This deliberately preserves academy records instead of deleting financial/history records.

## Payment proof flow

Parent → **Fees & Payment Proof → Record Payment**

Required fields include:

- student
- amount
- payment date
- method
- paid by
- compulsory screenshot / receipt image or PDF

Optional useful fields:

- payer relation
- UTR / transaction reference
- billing period
- notes

Allowed proof files: JPG/JPEG, PNG, WEBP, PDF. Default maximum size: 5 MB.

Submission status starts as **Pending**. It is not treated as an official payment yet.

Extension Admin can:

- View Screenshot
- Approve & Record in Main
- Ask for New Proof
- Reject

When approved, the extension sends a signed server-to-server request to the main tuition manager. The main manager creates the official payment with:

- student
- amount
- paid by
- payer relation
- method
- transaction reference
- billing period
- received by
- parent proof ID marker

The main manager then rebuilds its normal **Aacharya_Tuition_Master.xlsx**, so the verified parent payment appears in the existing Excel workbook.

## Duplicate protection

The extension checks for likely duplicate payment proof submissions using:

- same student + amount + date + transaction reference, or
- the same uploaded file SHA-256 hash.

The main bridge also treats `parent_proof_id` as an idempotency marker, so approving the same proof twice does not create two official payments.

## Multiple children

The same parent account can link another accepted child using another valid invitation. In Parent Portal → Account, paste the invitation code into **Link Another Child**.

## Main v3 integration

The only main-manager changes are contained in `integration/main-v3/parent-portal-bridge.js` plus two very small server hooks:

1. Mount the bridge routes.
2. Notify the extension after an admission is accepted.

A complete main v3 copy with those changes already applied is included separately in the delivery as **Aacharya Tuition Manager v3 Parent Bridge**.

The bridge exposes only secret-protected endpoints for:

- health
- accepted students
- one student's parent-safe summary
- verified parent payment creation

It does **not** expose admin credentials, other students, the Excel file, internal audit data, or unrestricted database access.

## Environment variables

See `.env.example`.

Important values:

- `EXTENSION_ADMIN_EMAIL`
- `EXTENSION_ADMIN_PASSWORD`
- `EXTENSION_SESSION_SECRET`
- `MAIN_MANAGER_URL`
- `PARENT_PORTAL_SECRET`
- `PUBLIC_BASE_URL`

`PARENT_PORTAL_SECRET` must be the **same long random secret on both Render services**.

## Persistent storage

Parent passwords/account database and payment-proof files are stored under `DATA_DIR`.

On Render, use the included persistent disk mounted at `/var/data`. Without persistent storage, uploaded screenshots and the extension database can disappear after a service restart/redeploy.

## Local run

Requires Node.js 22.13+.

```bash
npm start
```

Default development extension-admin login when environment variables are not set:

- Email: `admin@example.com`
- Password: `ChangeMe123!`

Do not use that password in production.

Run the extension smoke test:

```bash
npm test
```

Expected result:

`SMOKE TEST PASSED: admission hook, admin, invite, enrollment, parent signup, dashboard, required payment proof, renewal.`

## Privacy / safety notes

Payment screenshots may contain personal financial identifiers. They are never placed in public static folders. File access requires a logged-in parent who owns the proof or the extension admin.

Do not ask parents to upload passwords, OTPs, PINs, complete bank statements, government IDs, or unrelated financial documents.
