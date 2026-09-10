# V5.2 Adaptive UI & Customization Guide

## Theme modes

- **Follow device**: uses the operating system/browser light or dark preference.
- **Dark**: forces the dark academy dashboard.
- **Light**: forces the light academy dashboard.
- The header sun/moon button provides a one-click Light/Dark switch.

Theme and interface preferences are stored in browser local storage. They do not alter tuition data and can differ per device.

## Automatic device modes

V5 resolves the layout from the current browser width when **Device Layout = Auto detect**:

- **Mobile**: below 700 px.
- **Tablet**: 700–1099 px.
- **Desktop**: 1100 px and wider.

### Mobile

- Compact section dropdown instead of a long tab strip.
- Two-column dashboard counters.
- Single-column forms/settings.
- Students, Classes and Tests tables become labeled stacked cards.
- Header actions wrap into touch-friendly buttons.

### Tablet

- Sticky, horizontally scrollable touch navigation.
- Three-column dashboard summary cards.
- Two-column settings where space allows.
- Standard data tables remain scrollable.

### Desktop

- Permanent left navigation rail.
- Wide content workspace.
- Six-column dashboard metrics.
- Full information tables and two-column detail panels.

Manual Mobile, Tablet and Desktop overrides are available in Settings for preference/testing.

## Additional controls

- Accent colour picker.
- Comfortable / Compact information density.
- Small / Standard / Large / Extra Large text.
- Rounded / Soft / Square corners.
- Normal / High contrast.
- Normal / Reduced motion.
- Background-image darkness slider.
- Existing server-side Background Image URL remains supported.

## Persistence model

**Per browser/device:** theme, accent, device layout, density, text scale, corners, contrast, motion, background overlay.

**Server-side:** academy name, academic year, currency, background image URL and all tuition-management data.

This separation is intentional so one administrator can use, for example, compact dark mode on a desktop and larger light mode on a tablet without changing the appearance on every device.
