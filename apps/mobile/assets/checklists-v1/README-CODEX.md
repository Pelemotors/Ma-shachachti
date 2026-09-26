# CHECKLIST ASSET PACK V1 — CODEX

This pack supports the Checklist area of “מה שכחתי?”. It is intentionally smaller than the Home asset pack.

## NON-NEGOTIABLE
- Build the screen as real React Native UI. Do NOT turn the mockup into one image.
- Use the supplied V2 botanical PNGs for background decoration. Do not redraw/vector-trace the leaves.
- Prefer SVG icons. 96px PNG fallbacks are included.
- RTL is required.
- Keep the existing app bottom navigation behavior and data bindings.

## Screen model
The main Checklist screen has two semantic layers:
1. Active runs — checklists currently being executed, with progress.
2. Saved templates — reusable checklist definitions.

Template != Run. Checking an item in a run must not permanently mutate the reusable template.

## Required interactions
Create checklist; rename/edit; add/edit/delete/reorder items; duplicate; archive/delete; start/restart a run; mark item complete; link checklist to a Task/Routine; open overflow actions.

## Asset usage
- background/*: decorative only, absolute behind UI, low opacity; preserve aspect ratio.
- icons/categories/*: optional semantic category icon.
- icons/actions/*: menus and editing actions.
- icons/states/*: visual references; native/component checkbox may be used if it matches exactly.
- icons/navigation/*: use only if current shared nav assets are not already canonical.

## Visual tokens
Read tokens.json. Terracotta is the main action/accent; green is completion/success; peach and sage are soft surfaces.

## Reference
reference/checklist-ux-mockup.png is a UX/layout direction, not a screenshot to rasterize. Hebrew copy in the product should come from the product spec/data, not from pixels in the reference.

## Suggested main-screen hierarchy
SafeArea > header/title + add > filters/search > Active Runs > Saved Checklists > fixed bottom nav.
Use ScrollView/FlatList for content; bottom nav remains fixed.
