# BabylonJS follow-ups

## Staged terrain and water calculations

The current UI does not directly call the pure `terrainSurfaceWeights` or
`waterFlowSpeed` calculations in `webapp/src/settlementEditor.js`. They remain
useful, tested domain implementations for terrain-material parity and future
flow-aware river presentation, so they are intentionally retained.

`isOceanAtFeet` in `webapp/src/settlementTiles.js` is likewise retained for
future foliage, biome, and water-shading lookups. It reads the ocean-continuity
mask already generated for terrain tiles; it is not an obsolete terrain
implementation.

The multi-level blueprint editor is now wired to the UI. Levels, openings,
stairs, hatches and ladders, roofs, platforms, chimneys, and related editing
all use the normalized helpers in `buildingBlueprint.js` and `BlueprintLevels.js`.

## Building inspection and metadata

Inspect opens a building record when any of its walls or roofs is selected and
outlines its footprint. The record links to Build > Manage, where **Edit
building details** opens the metadata editor.

Optional `opens_at` and `closes_at` fields store daily hours as `HH:MM` in each
JSON building record. Closing before opening means an overnight schedule;
matching times mean open 24 hours. Missing or invalid hours are shown as unknown.
`economy_business_id` explicitly links a building to an economy business. Without
that link, only a unique normalized name match supplies the operating status.

Map View supports natural materials, building types, useful building categories,
and districts. The themed views include a legend and affect rendering only.

## Remaining building-management actions have no launch controls

`SettlementManager.js` still contains the local event picker and asset reroll
logic. Their dialogs and update paths are implemented, but
`openBuildingEvents` and `rerollSelectedBuilding` are not
currently connected to buttons. These were retained as staged UI work rather
than treated as dead backend/domain functionality.

## Workforce rebalance is not exposed

The economy client has a working request path for
`POST /api/economy/<campaign_id>/workforce/rebalance`, but the current UI has no
control that invokes `rebalanceWorkforce`. The request path was retained.
