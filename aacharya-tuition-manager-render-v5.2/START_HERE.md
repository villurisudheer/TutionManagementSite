# START HERE — Aacharya Tuition Manager v5.2.2

V5 is an in-place upgrade of the V4 project. It keeps the same SQLite database structure and the same comprehensive 27-sheet reporting model, while adding a fully customizable adaptive interface.

## What is new

- Light, Dark, or Follow Device theme.
- One-click theme toggle in the admin header.
- Automatic Mobile / Tablet / Desktop layout detection.
- Manual device-layout override for preference/testing.
- Desktop: permanent left navigation and wide working area.
- Tablet: touch-friendly horizontal navigation and balanced card layout.
- Mobile: compact section selector, 2-column summary cards, single-column forms, and card-style Students / Classes / Tests instead of compressed tables.
- Accent colour picker.
- Comfortable / Compact information density.
- Small / Standard / Large / Extra Large text.
- Rounded / Soft / Square corners.
- Normal / High contrast.
- Normal / Reduced motion.
- Adjustable background-image darkness.
- Browser favicon.
- V5 comprehensive Excel workbook remains 27 sheets and is automatically regenerated.

## Upgrade an existing Render deployment

1. Back up/download your current Excel workbook first if you want an extra safety copy.
2. Replace the GitHub source files with this V5 project and push to the same branch used by Render.
3. Keep the same Render Web Service and the same `/var/data` persistent disk. Do not delete the service or disk.
4. Let Render redeploy.
5. Open `/api/health` and confirm the version is `5.0.0`.
6. Open `/admin`, log in with your existing Render `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then open **Settings & Excel**.

The database filename is unchanged (`aacharya_tuition.sqlite`), so existing data remains compatible when the same persistent disk is retained. The generated workbook filename becomes `Aacharya_Tuition_Master_v5.xlsx`.

## Appearance settings

Appearance preferences are saved locally in the browser, not in the academy database. This is intentional: your phone, tablet and desktop can each use different presentation settings without affecting other devices. Academy name, academic year, currency and background-image URL remain server-side settings.

## Device breakpoints in Auto mode

- Mobile: below 700 px
- Tablet: 700–1099 px
- Desktop: 1100 px and above

## Parent Portal folder

The existing optional `parent-portal-extension/` and integration bridge from the supplied V4 project are retained unchanged. V5's main upgrade is the admin interface and V5 workbook/versioning.
