# Spatial Connections and Extradimensional Interiors

Phase 1 adds a campaign-owned spatial graph without replacing settlement blueprint data. Existing buildings, levels, rooms, and openings remain canonical JSON in `WorldAtlasLocation.buildings`; the new relational records identify coordinate systems and relationships between them.

## Spaces

`SpatialSpace` is an independently addressable coordinate system. The generated physical space for a conventional building points to a settlement and stable building ID and reads geometry from that building. The migration and settlement-save path create exactly one such deterministic root for each valid building. No building geometry is copied or rewritten. Graph-first planning may also create non-root physical annex/interior spaces; these remain ordinary planned spaces and never replace the generated root.

An extradimensional space can be planned without geometry or carry `independent_blueprint`, an optional blueprint using the existing `levels`, `rooms`, and `openings` shape. Its dimensions are never compared with the associated building. One space can therefore contain several rooms and floors.

Spaces may have organizational parents, but parentage does not transform coordinates. Parent cycles are rejected. Spatial graph edges are independent of this hierarchy and may contain cycles.

Example:

```text
Kolat Towers physical interior (30 ft tower)
  third-floor door endpoint
    <dimensional, bidirectional>
  Extradimensional Library (100 × 70 ft independent blueprint)
    Main Library
    Reading Room
    Archives
    second-floor gallery
```

## Endpoints and connections

`SpatialEndpoint` belongs to one space. A planned endpoint needs no position. A positioned endpoint may use a local `{x,y,z}` position or a geometry reference:

```json
{
  "source": "settlement_building",
  "level_id": "third-floor",
  "element_kind": "opening",
  "element_id": "library-door"
}
```

For an independent blueprint, use `space_blueprint` as the source. Door width, appearance, hinge, and state remain properties of the existing opening; the endpoint only identifies it. Missing or changed geometry makes the endpoint unresolved without deleting the planned relationship.

`SpatialConnection` links two stable endpoint IDs. It supports physical, dimensional, and teleportation types; one-way or bidirectional travel; enabled/disabled state; optional duration; future transition metadata; and future through-opening visibility. Multiple entrances, repeated edges, cross-floor links, disconnected subgraphs, and cycles are valid.

Enablement and readiness are separate. `ready_for_traversal` is computed and is true only when the connection is enabled, marked `ready`, and both endpoints resolve. Phase 1 does not perform traversal.

Connections must stay within a campaign. Deleting a connection preserves its endpoints. Deleting a referenced endpoint or a space with endpoints/children returns a conflict rather than silently cascading graph data. Generated physical spaces cannot be deleted while their building remains authoritative.

## API

All routes require a JWT and campaign owner/DM permission. Player discovery is intentionally deferred.

- `GET|POST /api/campaigns/<campaign_id>/spatial-spaces`
- `GET|PATCH|DELETE /api/campaigns/<campaign_id>/spatial-spaces/<space_id>`
- `GET|POST /api/campaigns/<campaign_id>/spatial-endpoints`
- `GET|PATCH|DELETE /api/campaigns/<campaign_id>/spatial-endpoints/<endpoint_id>`
- `GET|POST /api/campaigns/<campaign_id>/spatial-connections`
- `GET|PATCH|DELETE /api/campaigns/<campaign_id>/spatial-connections/<connection_id>`
- `GET /api/campaigns/<campaign_id>/spatial-graph?settlement_id=<id>&building_id=<stable-id>`

Space lists accept `building_id` and `settlement_id`; endpoint lists accept `space_id`; connection lists accept `space_id` and `incomplete=true`. The graph response contains `root_space_id`, compact spaces with room summaries, endpoints, connections, and computed readiness. The explicit root ID distinguishes the generated building interior from user-created physical spaces. The response deliberately omits complete blueprint geometry.

Validation failures return 400, unauthorized access returns 403, campaign-scoped misses return 404, and dependency conflicts return 409.

## Migration and compatibility

Migration `3d7e9f1a2b4c` creates the three tables after the current merged Alembic head and backfills physical spaces with UUIDv5 IDs derived from campaign, settlement, and building IDs. Runtime synchronization uses the same identity rule for later buildings. Repeated synchronization is idempotent.

The migration does not create rooms, endpoints, or connections from inferred geometry. Existing map loading, blueprint serialization, ordinary doors, rendering, and navigation continue to use their current paths.

## Phase 2 and later

The Phase 2 graph editor should create planned spaces, endpoints, and connections through these APIs, then associate endpoints with stable blueprint element IDs when geometry is placed. It does not need full blueprint payloads to render the graph.

Later work includes Babylon.js scene switching, traversal and transition effects, portal/window rendering, player discovery, and NPC spatial navigation. NPCs currently have no authoritative spatial-position record, so optional space-local NPC location belongs to the later navigation phase.

## Phase 2 graph editor

Building Details now exposes a wide Spatial Connections workspace powered by `@xyflow/react`. Space view shows physical, extradimensional, planned, and externally connected spaces; Room view derives room nodes from the same canonical or independent blueprints. Connection edges retain database IDs and distinguish physical, dimensional, teleportation, one-way, disabled, and unresolved states.

DMs can create disconnected planned spaces, drag between nodes to configure connections, choose existing endpoints or create placeholders, and drag a connection into empty canvas to create a new connected space. The connected-space and configured-connection APIs perform their multi-record writes in one transaction:

- `POST /api/campaigns/<campaign_id>/spatial-connected-space`
- `POST /api/campaigns/<campaign_id>/spatial-configured-connection`

Node coordinates and viewport state are presentation-only data in `SpatialGraphLayout`. They are stored per campaign, settlement, building, and `space|room` view through:

- `GET|PUT /api/campaigns/<campaign_id>/spatial-layout`

Moving a graph node never updates settlement, building-local, or Babylon.js coordinates. Automatic arrangement uses ELK layered layout and saves its result through the same layout API.

The graph highlights no-entrance spaces, draft/unresolved connections, disabled edges, and disconnected planned groups without rejecting unusual but valid graphs.

## Phase 3 blueprint integration

Space nodes now open the existing floor-plan editor. The generated physical root opens its canonical settlement-building blueprint; independently modeled spaces load `independent_blueprint` from the spatial-space API. Opening an unfinished independent space creates a local-coordinate starter blueprint and persists it before editing. Changes continue to use the existing blueprint schema and stable level, room, and opening IDs.

The compact graph response includes doorway and archway summaries plus each space's authoritative geometry source. Connection properties use those summaries to bind or unbind source and destination endpoints without copying opening dimensions or appearance. A bound endpoint is marked positioned and receives a geometry reference; removing the binding returns it to planned status. “Locate in blueprint” opens the correct level and selects the referenced opening. Removing or changing an opening leaves the endpoint unresolved through the existing readiness calculation.

Babylon.js scene switching, traversal, transition effects, portal previews, window anchors, player discovery, and NPC spatial navigation remain deferred.
