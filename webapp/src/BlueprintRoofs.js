import React, { useState } from 'react';

import {
  BLUEPRINT_ROOF_TYPES,
  blueprintId,
  levelAbove,
  levelBelow,
  openCorners,
} from './buildingBlueprint';

const ROOF_LABELS = {
  flat: 'Flat',
  shed: 'Shed / lean-to',
  gable: 'Gable',
  hip: 'Hip',
  dome: 'Dome',
  cone: 'Cone',
  mansard: 'Mansard',
  custom: 'Custom',
};

const FINISHES = ['shingles', 'slate', 'tile', 'metal', 'wood', 'stone'];

function roofTemplate({ type, support, visibility, footprint, holes = [], suffix = '' }) {
  return {
    id: blueprintId(),
    name: `${support.name} ${ROOF_LABELS[type]} roof${suffix}`,
    type,
    support_level_id: support.id,
    visibility_level_id: visibility.id,
    footprint: footprint.map(point => ({ ...point })),
    holes: holes.map(ring => ring.map(point => ({ ...point }))),
    pitch: 30,
    overhang: 2,
    thickness: 0.5,
    elevation_offset: 0,
    material: 'shingles',
    rotation: 0,
    ridge_direction: 0,
    slope_direction: 90,
    mansard_break: 3,
  };
}

export default function BlueprintRoofs({
  building,
  level,
  exposedAreas = [],
  onChange,
  onDrawCustom,
}) {
  const [newRoofType, setNewRoofType] = useState('gable');
  const [sourceLevelId, setSourceLevelId] = useState(level.id);
  const [selectedRoofId, setSelectedRoofId] = useState(null);
  const roofs = building.roofs || [];
  const selectedRoof = roofs.find(roof => roof.id === selectedRoofId);
  const lowerLevel = levelBelow(building, level);
  const sourceLevel = building.levels.find(item => item.id === sourceLevelId) || level;
  const roofVisibilityLevel = support => levelAbove(building, support) || support;

  const commitRoofs = nextRoofs =>
    onChange({
      ...building,
      roofs: nextRoofs,
    });

  const addRoofs = newRoofs => {
    if (!newRoofs.length) return;
    commitRoofs([...roofs, ...newRoofs]);
    setSelectedRoofId(newRoofs[newRoofs.length - 1].id);
  };

  const createFromCurrentLevel = () => {
    const footprint = openCorners(level);
    if (footprint.length < 3) return;
    addRoofs([roofTemplate({
      type: newRoofType,
      support: level,
      visibility: roofVisibilityLevel(level),
      footprint,
    })]);
  };

  const createFromExposedAreas = () => {
    if (!lowerLevel || !exposedAreas.length) return;
    addRoofs(exposedAreas.map((area, index) => roofTemplate({
      type: newRoofType,
      support: lowerLevel,
      visibility: level,
      footprint: area.footprint,
      holes: area.holes,
      suffix: exposedAreas.length > 1 ? ` ${index + 1}` : '',
    })));
  };

  const createFromSourceLevel = () => {
    const footprint = openCorners(sourceLevel);
    if (footprint.length < 3) return;
    addRoofs([roofTemplate({
      type: newRoofType,
      support: level,
      visibility: roofVisibilityLevel(level),
      footprint,
      suffix: ` from ${sourceLevel.name}`,
    })]);
  };

  const beginCustomRoof = () => {
    const template = roofTemplate({
      type: 'custom',
      support: level,
      visibility: roofVisibilityLevel(level),
      footprint: [],
    });
    setSelectedRoofId(template.id);
    onDrawCustom(template);
  };

  const updateRoof = change =>
    commitRoofs(roofs.map(roof =>
      roof.id === selectedRoof.id
        ? { ...roof, ...change }
        : roof
    ));

  const numberField = (label, key, min, max, step = 0.5) => (
    <label key={key}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={selectedRoof[key] ?? 0}
        onChange={event => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) updateRoof({ [key]: value });
        }}
      />
    </label>
  );

  return (
    <section className="blueprint-roofs">
      <h3>Roofs</h3>

      <label className="blueprint-roof-toggle">
        <input
          className="blueprint-roof-toggle-input"
          type="checkbox"
          checked={building.show_roofs !== false}
          onChange={event => onChange({ ...building, show_roofs: event.target.checked })}
        />
        <span>Show roofs</span>
      </label>

      <label>
        New roof type
        <select value={newRoofType} onChange={event => setNewRoofType(event.target.value)}>
          {BLUEPRINT_ROOF_TYPES.map(type => (
            <option key={type} value={type}>{ROOF_LABELS[type]}</option>
          ))}
        </select>
      </label>

      <button
        disabled={openCorners(level).length < 3}
        onClick={createFromCurrentLevel}
      >
        Create from level footprint
      </button>

      <button
        disabled={!exposedAreas.length}
        onClick={createFromExposedAreas}
      >
        Create Roof From Exposed Area{exposedAreas.length > 1 ? ` (${exposedAreas.length})` : ''}
      </button>

      <label>
        Copy footprint from
        <select
          value={sourceLevel.id}
          onChange={event => setSourceLevelId(event.target.value)}
        >
          {building.levels.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>

      <button
        disabled={openCorners(sourceLevel).length < 3}
        onClick={createFromSourceLevel}
      >
        Create from copied footprint
      </button>

      <button onClick={beginCustomRoof}>Draw custom polygon</button>

      {exposedAreas.length > 0 && (
        <p>{exposedAreas.length} exposed area{exposedAreas.length === 1 ? '' : 's'} detected below this level.</p>
      )}

      {roofs.length > 0 && (
        <div className="blueprint-roof-list" aria-label="Building roofs">
          {roofs.map(roof => (
            <div className="blueprint-row" key={roof.id}>
              <button
                aria-pressed={selectedRoofId === roof.id}
                onClick={() => setSelectedRoofId(roof.id)}
              >
                {roof.name || ROOF_LABELS[roof.type]}
              </button>
              <button
                aria-label={`Delete ${roof.name || ROOF_LABELS[roof.type]} roof`}
                onClick={() => {
                  commitRoofs(roofs.filter(item => item.id !== roof.id));
                  if (selectedRoofId === roof.id) setSelectedRoofId(null);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedRoof && (
        <div className="blueprint-roof-properties">
          <label>
            Roof type
            <select value={selectedRoof.type} onChange={event => updateRoof({ type: event.target.value })}>
              {BLUEPRINT_ROOF_TYPES.map(type => (
                <option key={type} value={type}>{ROOF_LABELS[type]}</option>
              ))}
            </select>
          </label>

          <label>
            Support level
            <select value={selectedRoof.support_level_id} onChange={event => updateRoof({ support_level_id: event.target.value })}>
              {building.levels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <label>
            Visible with level
            <select value={selectedRoof.visibility_level_id} onChange={event => updateRoof({ visibility_level_id: event.target.value })}>
              {building.levels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          {numberField('Pitch (°)', 'pitch', 0, 80, 1)}
          {numberField('Overhang (ft)', 'overhang', 0, 20, 0.5)}
          {numberField('Thickness (ft)', 'thickness', 0.1, 10, 0.1)}
          {numberField('Elevation offset (ft)', 'elevation_offset', -100, 100, 0.5)}
          {numberField('Rotation (°)', 'rotation', -360, 360, 1)}

          <label>
            Finish
            <select value={selectedRoof.material} onChange={event => updateRoof({ material: event.target.value })}>
              {FINISHES.map(finish => <option key={finish} value={finish}>{finish}</option>)}
            </select>
          </label>

          {selectedRoof.type === 'shed' && numberField('High-edge / slope direction (°)', 'slope_direction', -360, 360, 1)}
          {selectedRoof.type === 'gable' && numberField('Ridge direction (°)', 'ridge_direction', -360, 360, 1)}
          {selectedRoof.type === 'mansard' && numberField('Mansard break (ft)', 'mansard_break', 0.1, 100, 0.5)}
        </div>
      )}
    </section>
  );
}