# HYFIT Brand-Book Application Redesign

Date: 29 July 2026

Status: Approved design, pending written-spec review

## Objective

Completely reskin the HYFIT Judge, Manual Timing, Check-In, and Admin apps using
the uploaded 2026 HYFIT Games brand book while preserving every operational
workflow, API, timing rule, penalty rule, sync behavior, and field control.

The apps must feel like one unmistakable HYFIT operational platform: energetic,
inclusive, playful, competitive, and never intimidating. The brand translation
must also remain readable outdoors, usable by tenth-grade student volunteers,
and safe during high-pressure race operations.

## Source of truth

The redesign uses:

- `branding/Brandguidelines_V2.pdf`
- `branding/brandColours.jpeg`

Brand-book decisions:

- Primary display type: Foun
- Interface/body type: Sora
- Primary colours:
  - HYFIT Lime `#CEF932`
  - HYFIT Blue `#0381ED`
  - HYFIT Red `#FF0C31`
- Secondary colours:
  - Cobalt/Green `#009640`
  - Orange `#FC7B00`
  - Purple `#AE78D2`
  - Yellow `#FBD12C`
  - Pink `#FF9FF3`
  - Mid Neutral `#D5D4CE`
  - Light Neutral `#F3F3F0`

The guide prohibits stock imagery. No stock, generated, or unrelated fitness
photography will be introduced. Future photographs must be approved, original
HYFIT community imagery.

## Visual direction

Use the approved **hybrid brand skin**:

- vivid branded headers, navigation, primary actions, milestones, and receipts;
- dark graphite operational panels for timing, dense data, and outdoor
  readability;
- a light-neutral Admin canvas where it improves scanning and hierarchy;
- generous field controls and clear status labels;
- bold condensed display treatments used with restraint;
- the logo's diagonal race slash reused as a meaningful progress/status device.

The signature element is the **race slash**. It represents actual progress,
stage boundaries, scan activity, or completion. It is not repeated as arbitrary
decoration.

Oversized condensed numerals represent real BIBs, station numbers, stage
numbers, timers, and operation counts. They are never decorative filler.

## Asset strategy

### Logos

Derive production-ready logo assets from the vector artwork in the supplied PDF:

- primary HYFIT Games logo;
- secondary logo with `RUN. LIFT. LIVE`;
- monochrome white variant;
- dark/black variant where required;
- responsive transparent PNG exports;
- SVG only when the extracted vector paths can be validated cleanly.

The default application mark is the primary HYFIT Games logo without the
`Powered by Cult` endorsement. The endorsed secondary mark may be retained as an
optional approved asset but is not used by default.

The current bundled logo remains available under a legacy filename for one
release. New assets receive explicit brand-version filenames and are never
silently substituted by an image optimizer.

### Typography

The uploaded folder contains no separately licensed webfont files. Embedded PDF
fonts will not be extracted and redistributed.

Until official files are supplied:

- headings use a locally available licensed condensed display stack that
  approximates Foun's proportions;
- uppercase, tight tracking, slight oblique treatment, sharp line height, and
  deliberate scale reproduce the brand character without claiming the fallback
  is Foun;
- body/interface text uses a Sora-style geometric sans stack with large
  counters and high legibility;
- tabular numeric displays use a stable system numeric fallback.

Font stacks must work without internet access. If licensed Foun and Sora
webfonts are later provided, the shared token layer permits replacement without
rewriting components.

## Shared design system

Create one brand foundation used by every application:

- exact palette tokens;
- graphite surface and border extensions for operational contexts;
- display, interface, utility, and numeric typography roles;
- responsive type scale;
- spacing scale;
- border radii and shadows;
- minimum touch-target sizes;
- focus-visible and disabled states;
- status semantics;
- motion and reduced-motion rules;
- shared logo/wordmark treatment;
- form, card, table, modal, receipt, navigation, badge, callout, and action
  patterns.

Keep the previous colour variables as temporary aliases during the rollout so a
single token-level rollback remains possible. Remove aliases only after the
redesign is accepted.

### Status semantics

- Lime: safe primary action, confirmed progress, current operational step
- Blue: identity, information, scan/assignment context
- Red: ICS, destructive action, critical failure
- Green: successfully confirmed/synchronized
- Orange/Yellow: pending, warning, manual review
- Purple/Pink: non-critical category differentiation only
- Neutral: inactive, historical, secondary information

Status never relies on colour alone. Every state includes text and, where
useful, an icon.

Brand-red may frame non-destructive areas such as login or top navigation.
Inside operational forms, red remains reserved for danger and critical states.

## Judge app

Restyle:

- sign-in;
- top bar and event selection;
- athlete search and recent athletes;
- QR scanner;
- participant verification;
- pairing and assignment;
- race workflow;
- penalties and ICS;
- cognitive call and recall;
- result and history cards;
- help modal, messages, errors, offline and sync states.

Use lime-led actions, red brand framing, dark athlete cards, oversized BIB
numbers, and condensed station headings. Preserve the existing information
hierarchy and all controls.

The cognitive test retains its exact functional red, green, and yellow colour
values and button geometry. Brand styling may change framing, labels, progress,
and result presentation but must not bias or distort the test colours.

## Manual Timing app

Use:

- oversized stage and run numerals;
- the diagonal race slash as the course-progress strip;
- lime primary completion actions;
- blue information and recall accents;
- red only for ICS/OOC/danger;
- strong tabular timers;
- dark low-glare stage and split panels;
- branded completion receipt.

Retain every split, action boundary, cognitive interaction, penalty eligibility,
and RaceResult operation unchanged.

## Check-In app

Use HYFIT Blue as the core identity/verification accent:

- Stage 1 receives a prominent `01` and wristband label;
- Stage 2 receives a prominent `02` and transponder label;
- full identity, teammate, evidence, receipt, Help Desk, and sync information
  remains unchanged;
- primary controls stay at least as large as the current field controls;
- Stage 1 and Stage 2 are distinguishable by labels, stage numerals, and
  workflow—not by colour alone.

Restyle photo capture, signature canvas, asset scan, manual entry, success
receipt, blocking errors, and RaceResult pending/attention states.

## Admin app

Use Light Neutral `#F3F3F0` as the primary canvas with:

- brand-red shell/navigation identity;
- dark or white data panels selected for legibility;
- blue active navigation and information controls;
- lime safe primary actions;
- red destructive actions;
- orange/yellow warnings;
- oversized condensed operational counts;
- clear dense forms and tables using the interface font.

Restyle all tabs, login, metrics, event cards, staff/counter assignment,
integration settings, photo/signature policy, exceptions, asset replacement,
audit and system states. Privacy-sensitive and destructive actions remain
visually distinct and confirmation-protected.

## Responsive behavior

Desktop and large tablet:

- use split identity/action layouts where they improve scanning;
- retain persistent navigation or operational context;
- keep critical actions near the active work area.

Tablet:

- enlarge primary controls and data labels;
- preserve two columns only when content remains readable;
- avoid dense multi-column forms that require precision tapping.

Mobile:

- collapse to one guided vertical flow;
- keep primary actions sticky where already operationally useful;
- maintain minimum 56px touch targets;
- preserve large colour, scan, timing, and completion controls;
- avoid horizontal scrolling except intentional Admin data tables with explicit
  affordance.

## Accessibility and motion

- Meet readable contrast for operational text.
- Lime always uses dark text.
- Brand Blue and Brand Red use white text where contrast permits.
- Provide visible keyboard focus.
- Preserve semantic controls and screen-reader labels.
- Use labels/icons in addition to colour.
- Support zoom and responsive text without clipping.
- Respect `prefers-reduced-motion`.
- Limit motion to stage progress, scan feedback, success confirmation, and
  status transitions.
- Do not add ambient or decorative animation that could distract field users.

## Functional isolation

This redesign changes presentation only. It must not change:

- authentication or authorization;
- participant import and lookup;
- QR contents or scanner behavior;
- check-in stage ordering;
- media evidence policy;
- timing boundaries or split calculations;
- station outcomes, ICS, or contest-specific penalties;
- cognitive scoring;
- RaceResult field names, values, delivery, retries, or worker behavior;
- audit evidence;
- database schema or migrations, except when strictly required for static brand
  configuration (none is expected).

Any markup adjustment must preserve event handlers, disabled conditions,
keyboard semantics, and request payloads.

## Implementation sequence

1. Derive and validate logo assets.
2. Add shared brand tokens and typography roles.
3. Create shared control/status primitives through CSS and existing component
   boundaries.
4. Reskin Judge shell and login.
5. Reskin Manual Timing.
6. Reskin Check-In.
7. Reskin Admin.
8. Reskin shared QR, modal, receipt, error, loading, empty, offline, and sync
   states.
9. Remove redundant old declarations only after visual and functional
   verification.

The apps remain usable after each step. Do not leave mixed old/new styles in the
final delivery.

## Verification

Visual verification:

- desktop, tablet, and mobile screenshots for each application;
- all logins and primary empty states;
- athlete search, verification, QR, race, penalty, cognitive, and finish states;
- Manual Timing runs, stations, splits, recall and completion;
- both Check-In stages, evidence capture, receipts, blocks and Help Desk;
- every Admin tab, form, metric, exception and replacement state;
- loading, offline, pending sync, success, warning and error states;
- logo clarity on light, red, blue, lime, and dark backgrounds.

Functional verification:

- lint;
- all automated tests;
- production build and artifact validation;
- authenticated local smoke tests for Judge, Check-In and Admin;
- static asset HTTP checks;
- no missing build chunks;
- RaceResult worker remains healthy;
- no API, payload, timing, penalty or sync regressions;
- `git diff --check`.

Accessibility verification:

- contrast review;
- keyboard-only navigation;
- visible focus;
- reduced motion;
- screen-reader labels;
- 200% zoom spot checks;
- tablet/mobile touch-target checks.

## Rollback

Retain:

- previous logo under a legacy filename;
- old colour variables as aliases;
- one commit boundary before application-specific migration.

Because functionality remains unchanged, rollback consists of reverting brand
assets and CSS/markup styling commits without reversing operational database
changes.

## Out of scope

- changing workflows or business rules;
- adding stock or generated fitness imagery;
- extracting and redistributing embedded PDF fonts;
- inventing new logo variants not present in the guide;
- using the `Powered by Cult` mark without explicit need;
- changing cognitive test colours;
- reducing field button sizes;
- redesigning exports into marketing materials.
