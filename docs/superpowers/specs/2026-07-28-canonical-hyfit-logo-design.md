# Canonical HYFIT Logo Design

## Goal

Use only the official HYFIT Games logo in the application and eliminate duplicate public copies without altering the source brand reference folder.

## Approved Scope

- Use `brand/assets/hyfit-logo-red-SMZJ9JPG.png` as the source artwork.
- Keep `public/branding/hyfit-games-logo.png` as the single public application asset.
- Use that canonical asset in the header, event cards, favicon, shortcut icon, and Apple touch icon.
- Remove the duplicate `public/hyfit-games-icon.png`, which is byte-identical to the canonical logo.
- Do not display the Cult or Healthify sponsor logos.
- Leave every file under `brand/assets/` untouched as source/reference material.

## Verification

- Confirm the source and canonical public logo are byte-identical.
- Search application code and metadata for other logo paths.
- Confirm no sponsor logo is referenced by application code.
- Run lint, production build, and rendered HTML tests.
- Confirm the favicon metadata and visible logo components resolve to the canonical path.

## Out of Scope

- Changing the logo artwork, colours, spacing, or placement.
- Deleting source/reference files from `brand/assets/`.
- Adding a sponsor or partner section.
