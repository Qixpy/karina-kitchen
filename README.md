> **Complete catalog test build:** Catalogs, source pricing and assets are included for testing, as authorized on October 31, 2026. They are public in this repository.

## Run or deploy

Use `npm run dev` locally or import this repository into Vercel. The build command is `npm run build`, output directory `dist`, and framework preset Other. The complete catalog files are stored losslessly in `catalog-bundle/` to avoid thousands of duplicate assets. Build/dev restores and checksum-verifies all 4,211 files automatically; no external catalog service or credentials are needed.

Catalog pricing remains partially resolved. See [coverage and limitations](docs/private-catalogs.md).

# Kitchen Atelier — interactive design studio

An editable, browser-local 3D kitchen concept. Existing spacious three-facet layout, 149.5°/150.1° wall joints, island sink, four stools and natural lighting are preserved.

## Use

- Library: search/filter 66 planning items, then add one.
- Walls: choose **Add wall** or **Edit walls**. Select a wall to change length, height, thickness, position or rotation. A/B markers identify its ends; extend either end while keeping the other fixed, or choose an anchor when changing length. Walls can be duplicated, removed, undone and saved with the rest of the design. Cabinets stay in place during wall edits; add and position new cabinetry from the library. The floor and walking area grow with the design.
- Select a cabinet in the room or the room item list. Move uses X/Z handles; Rotate uses a horizontal ring. Exact position, size, elevation and angle fields are also available. Optional snap: 1-inch moves and 5/15/30/45/90-degree rotation.
- Selected item: change configuration, door collection and compatible finish. Duplicate/remove with undo/redo.
- Finishes: apply to one item, bases, uppers, tall cabinets, island or all cabinetry. Four stone choices always update the countertops and backsplash together.
- Walk: drag to look and use WASD/arrows or on-screen buttons.
- Save: named versions and autosave live in the current browser. Export/import JSON carries a design to another device. No cloud account or cross-device sync is implied.
- Phone: use the bottom sheet. The room stays visible above it. Close the sheet for the full view.

## Catalog

Official Fabuwood imagery and live style pages were checked on October 30, 2026. See [catalog evidence](docs/catalog-sources.md).

Catalina is slab/frameless. Tuscany has a wide shaker door on frameless Illume construction. Luna is slim shaker/framed Allure. The 24 requested combinations are listed; 23 are selectable. Luna Ocean Blue is not verified in the current official list and is disabled.

The 65 cabinet/furniture item families plus an editable room wall are editable planning models, not a complete ordering/SKU configurator. Dimensions are concept assumptions, not a measured installation plan. Specialty internals are represented schematically. Physical samples, current SKUs, clearances and installation details require dealer confirmation.

## Development and validation

No runtime dependencies or build framework. Three.js 0.170.0 is vendored with its license.

```sh
npm run dev
npm test
npm run build
```

Static files are in `dist/`. `room.js` retains the previous approved scene as a reference; `editor-scene.js` builds editable items. Automated tests cover geometry, profiles, texture coordinates, actual sink opening, collisions, disposal, async races, import validation, compatibility, editable wall geometry, anchored extensions and undo history. Older design files automatically gain the original editable walls; version 2 files preserve wall edits and intentional removals.

## Deploy on Vercel

Import `Qixpy/karina-kitchen` into Vercel. Use the repository root (`./`), Framework Preset **Other**, build command `npm run build`, and output directory `dist`. These build settings are already declared in `vercel.json`. No environment variables or backend services are required.

Saved designs remain in each browser. Customers can export/import design files to move them between devices. No Vercel deployment has been performed as part of repository preparation. `.openai/hosting.json` is metadata for the existing private Sites preview; Vercel serves only `dist/`.

Vercel documentation: https://vercel.com/docs/builds/configure-a-build

## Verification

Desktop 1440×1000 and phone 390×844 were inspected in the browser. Add, configure, move, rotate, duplicate/remove, undo/redo, group finish changes, linked stone, save and reload were exercised. These are conceptual 3D models, not photorealistic renders or manufacturing drawings.
