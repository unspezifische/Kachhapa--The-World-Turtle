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

## Building-management actions have dialogs/logic but no launch controls

`SettlementManager.js` still contains the building editor, local event picker,
and asset reroll logic. Their dialogs and update paths are implemented, but
`openBuildingEditor`, `openBuildingEvents`, and `rerollSelectedBuilding` are not
currently connected to buttons. These were retained as staged UI work rather
than treated as dead backend/domain functionality.

## Workforce rebalance is not exposed

The economy client has a working request path for
`POST /api/economy/<campaign_id>/workforce/rebalance`, but the current UI has no
control that invokes `rebalanceWorkforce`. The request path was retained.
