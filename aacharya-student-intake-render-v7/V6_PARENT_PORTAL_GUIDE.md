# V6 Integrated Parent Portal Guide

## Admission to Parent Access

```text
Admission submitted
→ Admin accepts
→ Student record created
→ Parent invitation generated
→ Parent opens /parent/signup?invite=...
→ Parent creates account
→ Parent account is linked only to that student
```

An unused invite defaults to 7-day validity. Admin can generate a fresh invite from Admin → Parent Portal.

## Multiple Children

The same parent account may link another child using another valid invitation. Backend authorization verifies `parent_student_links` before returning child data, accepting renewal requests or accepting payment proofs.

## Enrollment Lifecycle

Each course has its own enrollment:

```text
Upcoming → Active → Grace → Ended
```

The student identity remains permanent. A later/rejoined course creates another enrollment rather than overwriting the previous course.

### Alumni rule

`Old Records Alumni` contains only students who have enrollment history and currently have **zero** Upcoming/Active/Grace enrollments.

If an alumnus rejoins, the new enrollment makes them current immediately. They disappear from Old Records Alumni while old courses remain in Course History.

## Parent Course Warning

During the last 7 days of an Active enrollment, V6 creates a course-ending notification. During Grace, V6 creates a closing-soon notification. The defaults can be changed with environment variables.

## Renewal

Parent → Course & Renewal → submit request. Admin can approve it with a new start/end date or reject it with a note. An approved request creates the next enrollment.

## Payment Proof

The Parent Portal will not submit a payment without proof.

Required payment information includes:

- student
- amount
- payment date
- method
- payer name
- payer relationship
- optional UTR/reference, billing period and notes
- **compulsory screenshot/receipt file** (PNG/JPG/WEBP/PDF)

A payment proof begins as Pending. It becomes an official academy payment only after admin approval.

## Admin Verification

Admin → Parent Portal → Payment Proof Verification:

- View Proof
- Approve
- Ask for New Proof
- Reject

If a parent resubmits a proof, V6 keeps the previous proof file and metadata in proof history instead of silently replacing it.

## Payment Editing

Admin can edit an official payment. A reason for edit is compulsory.

```text
Payment V1 ₹4,000
→ admin edits + gives reason
→ V1 copied to payment_history
→ current website row becomes V2 ₹4,500
```

The live website displays only V2. The V1 record remains in Historical Payment Records and in the V6 Excel `Historical Payments` sheet.

## Parent Account Closure

If every linked child is a true alumnus and there is no pending renewal, the parent account becomes Disabled. A current/upcoming/grace enrollment or pending renewal keeps/re-activates access.
