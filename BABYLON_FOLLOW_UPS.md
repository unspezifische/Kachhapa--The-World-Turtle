# BabylonJS follow-ups

## Blueprint buildings are only partially wired to the UI

The building data model and Babylon renderer already support per-level:

- polygon footprints and floor heights;
- doors and windows;
- stairs, including turns and downward runs;
- floor hatches and optional ladders.

The current Build > Draw UI can place footprint corners, close a footprint,
duplicate it into another level, and save the building. It does not expose
controls for choosing a level or adding/editing doors, windows, stairs, or
hatches. Keep the following implementation in place when adding that UI:

- `addBlueprintStairs` and `addBlueprintHatch` in
  `webapp/src/settlementEditor.js`;
- the per-level opening, stair, and hatch rendering in
  `webapp/src/BabylonSettlementHost.js`.

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
