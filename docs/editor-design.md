# Kitchen Atelier editor

## Design plan

The room is the focus. A quiet Apple-inspired editing shell frames the kitchen, giving homeowners familiar controls while keeping technical scene controls secondary.

Palette: canvas gray #f5f5f7, panel white #ffffff, primary ink #1d1d1f, secondary ink #626269, selection blue #007aff, readable action blue #0066cc. Use blue sparingly for current selections and primary actions. Finishes supply the visual warmth.

Type: the local Apple/system sans stack. Project title 17px semibold, section titles 16px semibold, labels and controls 13–14px, guidance 12px. Numeric inputs use tabular figures. Text is left aligned except short segmented controls.

Desktop: 64px project toolbar above a 340px independently scrolling library and an expansive room view. Three tabs separate adding cabinets, editing a selected item, and changing finishes. Camera tools float over the room as compact translucent groups. Phone: compact project toolbar, room view, and a collapsible bottom sheet; the sheet only expands when someone opens editing controls.

```
Desktop                              Phone
┌ project / undo / save ──────────┐  ┌ project / save / more ┐
├ library │ room                 │  │ room                 │
│ search  │ orbit / move / rotate │  │ orbit / move / rotate │
│ picker  │                      │  │                      │
│         │ status               │  ├ Cabinets & finishes ─┤
└─────────┴──────────────────────┘  └ library / item / finish┘
```

Principles: roomy touch targets; controls named by their effect; preserve the kitchen's materials as the visual centerpiece; use cabinet silhouettes and actual finish previews instead of decorative imagery. Selection state has a border and semantic pressed state, not color alone. All inputs have explicit units and labels. Countertops and backsplash are presented as one paired choice.

## Review against brief

The original marketing-page style would hide editing controls below the room and waste space on a phone. Replace it with a full-height workspace. System type and soft gray are intentional because the user explicitly requested Apple UI. Avoid decorative cards around every field: only the selectable catalog objects and material samples receive card boundaries.

## Implementation contract

All prescribed controller IDs remain unchanged. Mobile expansion supports `#editor-panel.is-open`, `#editor-panel[data-open="true"]`, or `body.panel-open`; the controller updates `#panel-toggle` aria-expanded. Panels switch with `hidden`, and selected tab buttons use aria-selected or active. Dynamic cards support active, selected, and aria-pressed states. Touch targets are at least 44px. Motion respects reduced-motion. Dialogs are native and have named headings. No fonts or UI dependencies are fetched remotely.

Desktop sidebar is 340px, reduced to 310px on smaller desktop widths. Bottom sheet activates at 760px. Phone sheet collapsed footprint is 112px plus safe-area inset; expanded height is at most 64dvh. Controls wrap rather than pushing the viewport horizontally.
