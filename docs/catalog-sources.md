# Fabuwood catalog provenance

Verified 2026-10-30 against Fabuwood's live product pages. Finish images are downloaded from the Contentful CDN used by those pages. No color correction or fabricated texture is applied. The renderer samples the center panel using UV coordinates to avoid photographed drawer seams and door moldings. JPEG conversion/resizing is performed by the official image CDN; samples remain under 65 KB each.

## Construction and allowed finishes

- [Catalina](https://www.fabuwood.com/doorstyles/catalina): slab door; frameless Illume furniture-board box. The website also lists the Ovela plywood-box option, outside this Illume selection. Requested finishes verified: Bianco Matte, Muratti 4, Nocce 3, Como Ash 2, Ice Cream 1, Frappe 1, Agua Marina (Matte selected, consistent with the requested matte look).
- [Tuscany](https://www.fabuwood.com/doorstyles/tuscany): wide shaker **door profile**, still a **frameless Illume box**. A decorative door frame is different from a cabinet face frame. Requested finishes verified: Muratti 4, Nocce 3, Como Ash 2, Olmo 3, Woodline 1, Rosales 3, Blanco Matte, Azul Indigo Matte. Texture samples use the same named Catalina finish sample, with availability separately verified on Tuscany's page; geometry supplies the Tuscany profile.
- [Luna](https://www.fabuwood.com/doorstyles/luna): slim shaker, framed plywood Allure box. Frost, Dove, Kona, Sage Green, Cloud White, Linen, Stone and Oyster are listed. **Ocean Blue is not listed** in the current official Luna finishes; it is retained as a disabled requested option, with no fabricated texture or substitute. Absence is not proof of discontinuation; dealer confirmation is needed.

Every catalog finish includes its individual official product URL and direct CDN asset URL. Swatches depict the manufacturer's sample, not calibrated material measurements. Device settings, scene lights and real production variation affect appearance; approve physical samples before ordering. Matte/textured rendering roughness is an artistic approximation and not a measured manufacturer value.

## Functional cabinet families

Sources:

1. [Official Illume specification guide, 26 February 2026](https://assets.ctfassets.net/h0sz29d5jfiq/3WQpoFMclEwEKiuRTDTLwJ/d14e44c04a340fcc5b4dae475dd79aca/Illume_Spec_Book_02-26-26.pdf)
2. [Official Allure specification guide, 26 February 2026](https://downloads.ctfassets.net/h0sz29d5jfiq/hMD9fgIvMzJcwmYgi7Oj0/6dc8130d4cec78aaee7533b4318c468d/Allure_Spec_Book_02-26-26.pdf)
3. [Manufacturer's digital specification book](https://ezpricing.fabuwood.com/specbook)

The PDF cover says valid until April 2026, and both books direct readers to the digital spec book for updates. They establish the product-family taxonomy, not current orderability. The editor is deliberately a concept planner, not an order-entry or engineering system.

The 65 planning entries cover base doors and drawers; 2/3/4-drawer stacks; sink/farm/diagonal fronts; blind, easy-reach and Lazy Susan corners; wall heights/depths and corner variants; lift-up, appliance and microwave cabinets; glass display; shallow/deep pantries; oven towers; range-top bases; waste, spice, utensil, tray and rollout storage; wine storage; shelves, fillers, panels and toe kick; vanity and accessible concepts. Single-drawer modules are custom planning configurations, not verified standard standalone SKUs. Generic appliances, island assemblies, stools and pendants are explicitly not Fabuwood products.

Dimensions are editable design presets in metres, including an approximate plinth where relevant. They are not SKU dimensions. Not every family/size/finish is available in every series. Verify the final bill of materials, accessory fit, clearances, modifications and construction with a dealer using the current digital spec book. Decorative millwork such as corbels, posts, valances and crown profiles is not modeled as an exhaustive catalog of all orderable parts.

## Local asset inventory

`dist/catalog.js` exports `SERIES`, `TYPES`, and `CATALOG_NOTES`. There are 24 requested finish/series combinations: 23 verified selectable combinations, one pending availability, and 20 unique downloaded finish images. Each finish is scoped to its requested door style, never merged into an unrestricted global palette.
