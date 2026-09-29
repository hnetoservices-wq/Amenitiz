# Amenitiz — Rate Organizer

A small Manifest V3 extension for Chrome and Edge. Version 0.1.2 organizes the **rate plans page** (`/{locale}/admin/pricing_types`) on Amenitiz property subdomains.

## Install

1. Download this repository using **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Enable **Developer mode**, choose **Load unpacked**, and select the `extension` folder containing `manifest.json`.
4. Refresh Amenitiz and open the rate plans page.

Drag a **⋮⋮** handle onto another rate's upper or lower half to place it before or after that rate. Alternatively, focus its handle and use **Alt + Up/Down**. The toolbar also offers A–Z, Z–A, and original order. Escape cancels a drag. Portuguese and English labels are included.

## Scope and storage

- This is a personal display preference, saved in extension local storage, separately for each property hostname. It persists across refreshes and browser restarts in the same browser profile.
- It does not update Amenitiz's server-side order, rates, restrictions, booking engine, or connected OTAs. The inventory rate dropdown and bulk-update rate checkbox dropdown follow the same saved order, including changes from another open tab. The bulk-update “Select all” control stays at the top; rate checkbox selections are preserved. Other reservation rate selectors are not yet supported.
- New plans appear after saved plans until you reorder them. Original order follows the current order supplied by Amenitiz.
- No login credentials, external service, API keys, analytics, or network requests are used by the extension. Only rate IDs and their order are saved. Uninstalling clears these preferences.
- CSS changes visual order while leaving React-owned rows in their original DOM positions. Screen-reader reading order remains Amenitiz's original order. The inventory dropdown supports arrow keys, Home/End and Tab in the visual order.
- Built against the supplied rate-plan HTML. Amenitiz markup changes may require selector updates. Live account testing is still required.

## Development

There are no build dependencies. Reload the unpacked extension and refresh Amenitiz after edits.

`tests/dom.cjs` runs with jsdom installed and checks sorting, persistence, keyboard movement, drag/drop event logic, dynamic insertion, cleanup, and property isolation. `tests/smoke.cjs` runs with Playwright and its Chromium browser installed. Pass a local HTML snapshot as its first argument. The test strips scripts and blocks all network requests; never commit raw account HTML or credentials to this repository.
