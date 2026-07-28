# Cognitive Sequence Reveal Redesign

## Goal

Make the cognitive colour challenge more explicit and transparent by adopting the reference PDF's lettered Red/Green/Yellow presentation and revealing a position-by-position comparison after the athlete completes recall.

## Approved Experience

### Memorisation

- Replace the current eight-item Red/Green/Blue sequence with a ten-item Red/Green/Yellow sequence.
- Display every item as a large, high-contrast tile with its letter (`R`, `G`, or `Y`) centered over the corresponding colour.
- Keep position numbers visible so judges and athletes can understand the sequence direction.
- Preserve the existing timed memorisation step and automatic hiding behavior.
- Use white lettering on red and green tiles and black lettering on yellow tiles for contrast.

### Recall entry

- Present ten empty, numbered slots in one ordered row on wide screens and a responsive wrapped grid on narrow screens.
- Replace the Blue input control with Yellow.
- Each entered answer displays both its background colour and explicit letter.
- Tapping a completed slot removes that position, while Undo removes the latest entry.
- Do not show whether an individual answer is correct while recall is in progress.

### Transparent reveal

After all ten answers have been entered, show a comparison panel containing:

1. An **Original sequence** row.
2. An **Athlete response** row aligned position by position.
3. A correctness marker on each athlete-response tile: green check for a match and red cross for a mismatch.
4. A summary showing both the exact count and percentage, for example `8 / 10 correct · 80%`.
5. The existing pass or penalty message based on the configured 60% threshold.

The original sequence must remain hidden until all ten recall answers are entered. If an answer is edited after reveal, hide the comparison again until the response returns to ten entries, then recalculate it.

## Data and Scoring

- Represent each sequence item as a stable key, accessible label, display letter, and colour.
- Score each answer only against the item at the same position.
- Calculate `correctCount` from exact positional matches.
- Calculate correctness percentage as `Math.round((correctCount / 10) * 100)`.
- Preserve the current 60% pass threshold.
- Preserve the existing cognitive penalty choices and requirement to select a penalty when the score is below 60%.
- Persist the ten-item recall response through the existing active-race autosave payload.

## Component Boundaries

- A reusable colour tile renders one sequence item consistently across memorisation, recall entry, and reveal.
- A sequence row handles ordered layout and optional position labels.
- A comparison panel owns the original/response rows, match indicators, and score summary.
- The existing sequence and recall screens continue to own timing, input, navigation, and penalty state.

These may remain local components in `app/page.tsx` because the application is currently a single-page prototype; the change should not introduce a new component directory solely for this feature.

## Accessibility and Error Handling

- Never communicate a colour solely through hue: every tile includes `R`, `G`, or `Y`.
- Provide readable text labels for controls and correctness states.
- Use check/cross symbols plus accessible text for match status.
- Ensure yellow uses dark text and red/green use light text at sufficient contrast.
- Disable confirmation until all ten responses are present and any required penalty is selected.
- Prevent input beyond ten items.
- Preserve keyboard focus behavior and responsive usability.

## Verification

- Unit-test scoring for all-correct, partially correct, and all-incorrect responses.
- Assert that the percentage and exact count agree.
- Assert that the original sequence is absent before recall completion and present after ten entries.
- Assert that each revealed response position receives the correct match or mismatch status.
- Assert that Yellow replaces Blue in both memorisation and recall controls.
- Run lint, production build, and rendered-HTML tests.
- Visually verify wide and narrow layouts, including wrapping of ten tiles and readable contrast.

## Out of Scope

- Changing station penalties or the race workflow.
- Randomly generating a new sequence.
- Changing the 60% pass threshold or cognitive penalty values.
- Revealing correctness before all ten answers are entered.
