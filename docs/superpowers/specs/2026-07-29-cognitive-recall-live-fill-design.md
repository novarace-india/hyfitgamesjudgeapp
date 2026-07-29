# Cognitive Recall Live Fill Design

**Date:** 2026-07-29  
**Status:** Approved for implementation

## Goal

Restore clear position-by-position visual feedback during Cognitive Recall
without changing the existing large colour buttons or any other Judge App
interface or behavior.

## Interaction

- Retain the current Red, Green, and Yellow button sizes, layout, labels, and
  tap behavior.
- Keep the numbered ten-position athlete-response row above the buttons.
- When a colour tap is accepted, fill the next response box with that colour
  and show its `R`, `G`, or `Y` label.
- Preserve the filled response row after the tenth tap.
- After automatic scoring completes, reveal a second row labelled **Actual
  sequence** beneath the athlete response.
- Mark every athlete-response position as correct or incorrect by comparing it
  with the same position in the actual sequence.

## Preserved behavior

- The tenth tap remains the Cognitive Recall completion boundary.
- Recall timing, automatic score calculation, penalty/bonus calculation, RR14
  writes, and Finish Line transition remain unchanged.
- Reset remains available only before the tenth tap.
- No other Judge App screen, component, style, API, race stage, or feature is
  changed.

## Acceptance criteria

1. Each accepted tap immediately fills exactly one numbered response box.
2. The filled box uses the selected colour and retains a readable letter.
3. Rapid taps are not dropped or reordered.
4. Before completion, the actual sequence is not shown.
5. After the tenth tap and server acceptance, both athlete response and actual
   sequence remain visible.
6. Correct and incorrect positions are visually distinguishable without
   relying only on colour.
7. Existing automated timing, scoring, synchronization, and navigation tests
   continue to pass.
