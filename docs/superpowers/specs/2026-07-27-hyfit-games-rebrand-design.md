# HYFIT Games Rebrand Design

## Goal

Rebrand the existing judge console from HYVEFIT to HYFIT GAMES using the supplied official logo set while preserving the console's established workflow, dark field-operations layout, and functional status language.

## Approved Direction

Use a brand-led dark theme:

- The event brand is **HYFIT GAMES**.
- The event listing name is **HYFIT Games Bengaluru**.
- The tagline is **RUN. LIFT. LIVE.**
- The supplied `Hyfit games_with tagline-04.png` artwork is the primary logo on dark surfaces because its white and burgundy treatment has the strongest contrast.
- Burgundy, white, and black carry the event identity.
- Lime remains reserved for operational meaning: live, synced, ready, success, active progress, and primary task completion.
- The existing information architecture, judge workflow, and responsive layouts remain unchanged.

## Scope

### Brand assets

- Copy the appropriate supplied logo artwork into `public/` with a stable, descriptive filename.
- Produce web-sized derivatives so the application does not ship the original 10417 × 10417 source image to browsers.
- Use a compact derivative for the header and event cards.
- Replace the generic favicon with a HYFIT-branded favicon derived from the supplied artwork.
- Preserve transparency and sufficient clear space around the logo.

### Interface copy

- Replace all user-visible HYVEFIT references with HYFIT GAMES.
- Rename event cards and event context labels to HYFIT Games Bengaluru / HYFIT GAMES.
- Keep product-specific text such as “Judge Console” where it identifies the tool rather than the event.
- Update browser metadata, description, package display name, README title, and relevant application-facing storage identifiers.

### Visual system

- Introduce burgundy as the primary brand accent based on the supplied artwork.
- Use burgundy for branded eyebrows, decorative rules, branded card details, and event identity.
- Retain lime only for operational states and actionable success cues.
- Keep warning, error, recall-sequence, and penalty colors semantically distinct.
- Replace improvised text marks such as “HY” with the supplied logo rather than recreating the logo in CSS.

## Component Treatment

### Header

Display the compact HYFIT GAMES tagline logo with “Judge Console” as a secondary product label. The brand button behavior remains unchanged.

### Login

Preserve the current high-contrast layout. Introduce burgundy in the field-operations eyebrow and restrained decorative accents. Keep the lime emphasis in “confidence” and the continue action because these are operational/action signals.

### Event selection

Use the official logo in both event cards. Use burgundy for live event identity and branded card detailing; keep live readiness and entry affordances legible without confusing brand red with errors.

### Active judging flow

Update event-name references only. Station progress, sync, readiness, successful completion, penalties, warnings, and recall colors retain their semantic behavior.

## Technical Approach

- Store optimized PNG assets under `public/branding/`.
- Render assets with the framework image component where practical, using explicit dimensions and meaningful alternative text.
- Centralize brand colors as CSS custom properties and map existing semantic colors separately so brand and status colors cannot accidentally become coupled.
- Rename the local-storage key to a HYFIT-specific key. To avoid unexpectedly discarding an in-progress demo race, read the old key once as a fallback, migrate its value to the new key, and remove the old key after successful migration.
- Update metadata and icons in `app/layout.tsx`.
- Update visible copy and logo rendering in `app/page.tsx`.
- Update styling in `app/globals.css`.
- Update package metadata and README branding without renaming the physical project directory.

## Error Handling and Accessibility

- If a logo asset fails to load, its alternative text must still identify HYFIT GAMES.
- Logo contrast must remain readable on the dark header and cards.
- Do not use burgundy or lime as the only indicator of application state; existing text labels and shapes remain.
- Preserve keyboard behavior, focus styles, responsive breakpoints, and print behavior.

## Verification

- Search the repository for stale `HYVEFIT`, `HyveFit`, and improvised `HY` brand references.
- Run the existing test suite and production build.
- Add or update rendered-HTML assertions for the new event name, metadata, and logo alternative text.
- Verify the login and event-selection screens at desktop and mobile widths.
- Step through the complete judging workflow to confirm the rebrand does not change behavior.
- Confirm the favicon, header logo, event-card logo, and metadata all use HYFIT branding.
- Confirm lime remains limited to operational state and action semantics.

## Out of Scope

- Changing the judging workflow, race rules, sample participants, station list, or data model.
- Redesigning page structure or introducing new screens.
- Renaming the on-disk repository directory.
- Creating a new logo or altering the supplied logo geometry.
