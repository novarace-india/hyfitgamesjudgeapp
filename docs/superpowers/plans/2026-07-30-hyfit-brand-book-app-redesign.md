# HYFIT Brand-Book Application Redesign — Implementation Plan

Date: 30 July 2026

Source specification:
`docs/superpowers/specs/2026-07-29-hyfit-brand-book-app-redesign.md`

## Goal

Apply the approved hybrid HYFIT skin to Judge, Manual Timing, Check-In, and
Admin without changing authentication, race logic, timing boundaries, penalty
rules, payloads, RaceResult delivery, or stored data.

## Work plan

1. Preserve the current logo under an explicit legacy name and derive clean,
   transparent HYFIT brand-book logo exports for light and dark surfaces.
2. Move all global CSS imports to the root layout so production builds cannot
   emit a missing CSS-only JavaScript chunk.
3. Add a shared offline-first token layer for the brand palette, graphite
   operational surfaces, typography roles, spacing, radii, focus, touch size,
   status semantics, and reduced motion.
4. Reskin the Judge shell, navigation, participant workflow, station workflow,
   cognitive challenge, sync states, history, and completion receipt.
5. Reskin Manual Timing with oversized stage/timer data and an operational
   race-progress treatment.
6. Reskin Check-In around a blue identity workflow with explicit Stage 01 and
   Stage 02 treatments, large scan/asset actions, evidence controls, and
   receipts.
7. Reskin Admin on a light-neutral control canvas with branded navigation,
   dense readable cards/tables, and unambiguous action/status semantics.
8. Validate responsive layouts at desktop, tablet, and narrow mobile widths;
   preserve minimum 56px primary field targets and visible keyboard focus.
9. Run lint, the full Node test suite, production build, artifact validation,
   source diff checks, static-asset HTTP checks, and authenticated local smoke
   checks for all four applications.
10. Restart the local application on port 4323, visually inspect representative
    screens, fix any regressions, then commit and push the completed redesign.

## Functional guardrails

- Do not alter event handlers, request bodies, disabled conditions, scoring,
  timing, contest eligibility, RR fields, retry behavior, or database schema.
- Preserve exact cognitive test colours and control geometry.
- Use red for destructive/critical operational states; brand-red framing may
  appear only outside active operational controls.
- Keep status text alongside every status colour.
- Do not introduce network font or image dependencies.

## Verification gates

- No missing `/assets/*.js` or `/assets/*.css` requests from built pages.
- Judge, Timing, Check-In, and Admin load from the same production build.
- Existing automated tests pass unchanged.
- Login and authenticated API requests continue to obey their current roles.
- Layout remains usable at 390px, 768px, and desktop widths.
- `prefers-reduced-motion` and `:focus-visible` are covered globally.
