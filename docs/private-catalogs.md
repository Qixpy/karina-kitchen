# Private catalog workspace — 31 October 2026

The user explicitly authorized publishing the complete catalog build, including supplier pricing, to Qixpy/karina-kitchen on October 31, 2026. This supersedes the earlier instruction to keep those files out of GitHub. The repository and its static catalog data are public. The directory name `private-catalogs` is retained for URL compatibility and does not enforce privacy. All catalog data and assets are stored losslessly in `catalog-bundle/` and restored automatically by the build script.

The customer example quote PDF was read as a format reference only. It is not included in the project or deployment. Customer names/address/project notes are entered by the user and remain in that browser's saved design until they explicitly export a design or PDF. Browser saves are device-local, not cloud sync.

## Implemented

- Lazy per-catalog loading, manufacturer and catalog-code picker, search, categories, bounded result rendering, source specification links and style/finish choices.
- Catalog dimension locks, move/rotate/duplicate, finish changes within the same catalog, and explicit conversion to an unpriced custom planning item.
- Separate blank, L-shaped and three-wall room starts; previous room saved before replacement.
- Quote PDF downloads directly. No price table or quote preview in the editor. Exact source list prices are used when their joins are established; no dealer multiplier. Unknowns remain TBD and force a draft/incomplete subtotal.
- Each catalog selection stores its identity, not a trusted client price. A quote resolves the source record again; custom dimensions or unresolved options do not inherit a stock price.
- Incremental 3D rebuilding and rendering only when the view changes. Existing continuous stone mapping and lighting retained. Subtle front bevels; real imported texture or linear RGB color where available, neutral gray otherwise. This remains a real-time planning model, not a photorealistic fabrication model.

## Import coverage

| Catalog group | Records | Placeable dimension records | Price status |
|---|---:|---:|---|
| Fabuwood, ten supplied codes | 8,376 | 176 | Unresolved; legacy conversion pricing is not a verified current catalog total |
| Milestone NAC_SS | 311 | 267 | Source-dated prices on 288 products; finish-specific availability varies |
| Milestone NAC1 | 386 | 313 | Source-dated prices on 371 products; finish-specific availability varies |
| Milestone NAC2 | 386 | 313 | Source-dated prices on 371 products; finish-specific availability varies |
| Milestone NAC_FL | 220 | 0 | Native identities recovered; dimensions, finish compatibility and price rules unresolved |
| Tribeca TRIBECAA | 552 | 0 | Native identities recovered; dimensions, finish compatibility and price rules unresolved |

Counts are catalog-scoped records, not unique cabinet families across A/B editions. Prices attached to non-placeable records cannot create a quote line. Product-level counts do not imply every finish or modification is priced.

## Source integrity limits

- Archives include proprietary Raima records, current DataPack option lists and older conversion data. Native generic REC templates must not be treated as the manufacturer's final cabinet measurements. Native EXTHDR identities and raw payload evidence are retained separately.
- Fabuwood conversion price tables are a shared legacy superset; some PDF pages have hidden older text. Automatically extracted candidates are reference records. Only visually verified dimensional diagrams enable placement. Global style/finish combinations do not establish SKU-specific ordering eligibility.
- Illume base cabinet height is the cabinet body before adjustable feet; UI discloses this. The planning shape does not reproduce the manufacturer foot assembly.
- NAC_FL's CiC3 metadata identifies a generic Cyncly catalog. Its 415 template records and zero-price placeholders are excluded from selectable inventory.
- NAC_SS and NAC1/NAC2 newer finish lists exceed their older pricing lists. Only exact matches inherit a source price; source price-list codes remain in the PDF. Pricing is a source-dated estimate, not a claim of current supplier confirmation.
- Tribeca's included PDF guides identify St. Martin. They remain reference documents with this conflict disclosed.
- Door sample thumbnails are for the picker only, never repeated as surface textures. Missing finish maps are not guessed.

## What is still required for full ordering/quoting parity

A manufacturer or Design Flex readable export (CSV/XLSX or documented JSON/XML) with SKU, configured width/height/depth, door style, finish code, current list price, option/upcharge rules and effective dates; alternatively current readable price/spec books. Until then, native unresolved catalogs and options remain reference-only/TBD. Appliance, stone fabrication, delivery, labor and taxes are excluded unless separately specified. No complete-project price is inferred from cabinetry alone.

## Validation

41 automated tests cover catalog resolution, dimension/option pricing safeguards, money arithmetic, multi-page PDFs, project/import metadata, wall geometry, collisions, independent stools, continuous stone mapping, imported material colors and incremental rebuilds. Local browser checks exercised product search/addition, direct PDF download, new-room preservation and a 390px responsive layout. The downloaded PDF was parsed and visually rendered for inspection.
