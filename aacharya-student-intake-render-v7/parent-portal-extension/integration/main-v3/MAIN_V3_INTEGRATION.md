# Main v3 integration changes

This extension does not share or directly open the main tuition-manager database.

The bridge is a small module mounted inside the main server and protected by `PARENT_PORTAL_SECRET`.

## Environment variables in the main manager

```text
PARENT_PORTAL_URL=https://YOUR-PARENT-PORTAL.onrender.com
PARENT_PORTAL_SECRET=THE_SAME_LONG_SECRET_AS_THE_EXTENSION
```

## Integration endpoints added to main v3

All require:

```text
Authorization: Bearer <PARENT_PORTAL_SECRET>
```

Endpoints:

- `GET /api/integration/parent/health`
- `GET /api/integration/parent/accepted-students`
- `GET /api/integration/parent/students/:id/summary`
- `POST /api/integration/parent/payments`

The parent portal never receives unrestricted access to the main database.

## Admission hook

After the existing main v3 intake acceptance successfully creates the student, one non-blocking call is made:

```text
parentPortalBridge.notifyAdmissionAccepted(student)
```

If the parent extension is unavailable, the admission still succeeds. Later, **Sync Accepted Admissions** in the extension admin recovers the student.
