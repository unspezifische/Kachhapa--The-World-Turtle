import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BlueprintLevels from './BlueprintLevels';
import { arcFromThreePoints, wallPolyline } from './buildingBlueprint';

test('repairing wall connections is a single undoable edit including door placement', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'repair', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
        walls: [{ id: 'divider', type: 'line', start: { x: 10, y: 0.5 }, end: { x: 10, y: 9.5 } }],
        openings: [{ id: 'door', kind: 'door', wall_id: 'divider', distance_from_start: 4, width: 3, height: 7 }],
      }] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  const before = JSON.parse(JSON.stringify(current.levels[0]));
  const repair = screen.getByRole('button', { name: 'Repair Wall Connections' });
  expect(screen.getByLabelText('Selected element settings')).toContainElement(repair);
  fireEvent.click(repair);
  expect(current.levels[0].walls[0].start.y).toBe(0);
  expect(current.levels[0].walls[0].end.y).toBe(10);
  expect(current.levels[0].openings[0].distance_from_start).toBe(4.5);
  expect(current.levels[0].rooms).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(current.levels[0].walls).toEqual(before.walls);
  expect(current.levels[0].openings).toEqual(before.openings);
});

test('new interior wall connections take priority over right angle and grid snapping', () => {
  const originalPoint = SVGElement.prototype.createSVGPoint;
  const originalMatrix = SVGElement.prototype.getScreenCTM;
  SVGElement.prototype.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'snap', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }] }] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} />;
  }
  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'wall' } });
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 8, clientY: -0.5 });
    expect(screen.getByLabelText('Connected wall endpoint')).toBeInTheDocument();
    fireEvent.click(canvas, { clientX: 9, clientY: -9.5 });
    expect(current.levels[0].walls[0]).toMatchObject({ start: { x: 8, y: 0 }, end: { x: 9, y: 10 } });
    expect(current.levels[0].rooms).toHaveLength(2);
  } finally {
    SVGElement.prototype.createSVGPoint = originalPoint;
    SVGElement.prototype.getScreenCTM = originalMatrix;
  }
});

test('level construction controls change floors and apply a material to every exterior wall', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'materials', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] }] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.change(screen.getByLabelText('Floor material'), { target: { value: 'stone' } });
  fireEvent.change(screen.getByLabelText('Exterior wall material'), { target: { value: 'wood' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to all exterior walls' }));
  expect(current.levels[0].floor_material).toBe('stone');
  expect(current.levels[0].outline).toHaveLength(4);
  expect(current.levels[0].outline.every(wall => wall.material === 'wood')).toBe(true);
});

test('opening the editor automatically identifies enclosed rooms', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'rooms', name: 'Rooms', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }] }] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  expect(current.levels[0].rooms).toHaveLength(1);
  expect(current.levels[0].rooms[0]).toMatchObject({ boundary_source: 'auto', boundary_locked: false });
});

test('a selected room can change the thickness of every boundary wall from the side panel', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  SVGElement.prototype.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  const center = { x: 10, y: 10 };
  const radius = 10;
  const circleArcs = Array.from({ length: 4 }, (_, index) => {
    const startAngle = index * Math.PI / 2;
    const endAngle = (index + 1) * Math.PI / 2;
    const pointAt = radians => ({
      x: center.x + Math.cos(radians) * radius,
      y: center.y + Math.sin(radians) * radius,
    });
    return arcFromThreePoints(
      pointAt(startAngle),
      pointAt(endAngle),
      pointAt((startAngle + endAngle) / 2),
      { id: `tower-arc-${index + 1}`, thickness: 0.5 }
    );
  });
  const roomRegion = circleArcs.flatMap(wall => wallPolyline(wall, 1).slice(0, -1));
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'room-wall-thickness', name: 'Round Tower', coordinate_space: 'local', x: 0, y: 0,
      levels: [{
        id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
        corners: circleArcs.map(wall => wall.start),
        outline: circleArcs,
        rooms: [{
          id: 'tower-room', name: 'Tower room', purpose: 'Other', boundary_source: 'auto', boundary_locked: false,
          region: roomRegion,
        }],
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select room Tower room' }));

    expect(screen.getByLabelText('Room wall thickness (ft)')).toHaveValue(0.5);
    expect(screen.getByText('Applies to all 4 wall segments around this room.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Room wall thickness (ft)'), { target: { value: '1.25' } });

    expect(current.levels[0].outline).toHaveLength(4);
    expect(current.levels[0].outline.every(wall => wall.thickness === 1.25)).toBe(true);
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
  }
});

test('levels, image upload and alignment changes are attached to the chosen floor', async () => {
  let current;
  const upload = jest.fn().mockResolvedValue({ image_url: '/test-plan.png', width_feet: 40, height_feet: 30, x: 0, y: 0, rotation: 0, opacity: 0.6 });
  function Harness() {
    const [building, setBuilding] = useState({ id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0, levels: [
      { id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10, corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] },
    ] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={upload} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Add above'));
  expect(current.levels).toHaveLength(2);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  expect(screen.getByLabelText('Snap walls and footprint edges to the building grid (90°)')).toBeChecked();
  expect(screen.getByText(/real-world rotation is applied in the 3D scene/)).toBeInTheDocument();
  const input = screen.getByLabelText('Upload floor image');
  fireEvent.change(input, { target: { files: [new File(['image'], 'manor.png', { type: 'image/png' })] } });
  expect(await screen.findByLabelText('Image width (ft)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Image placement/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.change(screen.getByLabelText('Image width (ft)'), { target: { value: '45' } });
  expect(current.levels[1].floor_map.width_feet).toBe(45);
  expect(current.levels[0].floor_map).toBeUndefined();
  expect(upload.mock.calls[0][1].id).toBe(current.levels[1].id);
});

test('a selected middle level can be deleted and restored without renumbering survivors', () => {
  let current;
  const removeReferences = jest.fn();
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'gap-tower', name: 'Gap Tower', coordinate_space: 'local', x: 0, y: 0,
      visible_level_id: 'two', levels: [
        { id: 'one', name: 'Level 1', level_number: 1, elevation_feet: 10, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] },
        { id: 'two', name: 'Level 2', level_number: 2, elevation_feet: 20, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
          floor_map: { image_url: '/two.png' }, rooms: [{ id: 'room', region: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }] }] },
        { id: 'three', name: 'Level 3', level_number: 3, elevation_feet: 30, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] },
      ],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding}
      onDeleteLevelReferences={removeReferences} uploadImage={jest.fn()} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Level 3' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Rooms1');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(current.levels).toHaveLength(3);

  fireEvent.click(screen.getByRole('button', { name: 'Delete Level 3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete and leave empty' }));
  expect(removeReferences).toHaveBeenCalledWith('two');
  expect(current.levels.map(level => level.id)).toEqual(['one', 'three']);
  expect(current.visible_level_id).toBe('one');
  expect(screen.getByRole('button', { name: 'Add Level 3' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Add Level 3' }));
  expect(current.levels.map(level => level.level_number)).toEqual([1, 2, 3]);
  expect(current.levels[1].id).not.toBe('two');
  expect(current.levels[1].floor_map).toBeUndefined();
});

test('a level can be deleted while collapsing the upper floors into its place', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'collapse-tower', name: 'Collapse Tower', coordinate_space: 'local', x: 0, y: 0,
      visible_level_id: 'two', levels: [
        { id: 'one', name: 'Level 2', level_number: 1, elevation_feet: 10, floor_height: 10 },
        { id: 'two', name: 'Level 3', level_number: 2, elevation_feet: 20, floor_height: 10 },
        { id: 'three', name: 'Level 4', level_number: 3, elevation_feet: 30, floor_height: 10 },
      ],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Level 3' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Moves 1 upper level down 10 ft');
  fireEvent.click(screen.getByRole('button', { name: 'Delete and collapse' }));

  expect(current.levels.map(level => [level.id, level.level_number, level.elevation_feet, level.name])).toEqual([
    ['one', 1, 10, 'Level 2'], ['three', 2, 20, 'Level 3'],
  ]);
  expect(screen.queryByRole('button', { name: 'Add Level 3' })).not.toBeInTheDocument();
});

test('the final remaining level cannot be deleted', () => {
  render(<BlueprintLevels building={{ id: 'one-floor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{ id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] }] }}
  onChange={jest.fn()} uploadImage={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Delete Level 1' })).toBeDisabled();
});

test('the floor-plan action follows the Levels heading before level settings', () => {
  const building = {
    id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{
      id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
    }],
  };
  const { container } = render(<BlueprintLevels building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);
  const elements = Array.from(container.querySelector('.blueprint-levels').children);
  expect(elements.slice(0, 3).map(element => element.tagName)).toEqual(['H3', 'BUTTON', 'LABEL']);
  expect(elements[1]).toHaveTextContent('Edit floor plan & walls');
});

test('levels can be switched without leaving the floor-plan editor', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'switchable', name: 'Switchable House', coordinate_space: 'local', x: 0, y: 0,
      visible_level_id: 'ground',
      levels: [
        { id: 'ground', name: 'Ground Level', level_number: 0, elevation_feet: 0, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] },
        { id: 'upper', name: 'Level 1', level_number: 1, elevation_feet: 10, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] },
      ],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit floor plan & walls' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Switchable House · Level 1');

  fireEvent.change(screen.getByLabelText('Editing level'), { target: { value: 'upper' } });

  expect(current.visible_level_id).toBe('upper');
  expect(screen.getByRole('dialog')).toHaveTextContent('Switchable House · Level 2');
  expect(screen.getByLabelText('Editing level')).toHaveValue('upper');
});

test('new building draft exposes Arc and Circle footprint tools before saving', () => {
  const building = { id: 'draft', coordinate_space: 'local', x: 0, y: 0, levels: [{ id: 'ground', corners: [{ x: 0, y: 0 }] }] };
  render(<BlueprintLevels drafting building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);
  expect(screen.queryByLabelText('Active level')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Draw Footprint — Arc / Circle Tools' }));
  expect(screen.getByLabelText('Structure tool')).toHaveValue('footprint');
  expect(screen.getByRole('option', { name: 'Circle' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Arc', exact: true })).toBeEnabled();
});

test('image placement drawer starts closed and opens for Align with grouped size fields', () => {
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
        floor_map: {
          image_url: '/plan.png',
          width_feet: 40,
          height_feet: 30,
          x: 0,
          y: 0,
        },
      }],
    });
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  const drawerButton = screen.getByRole('button', { name: /Image placement/ });
  expect(drawerButton).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByLabelText('Upload floor image')).toBeInTheDocument();
  expect(screen.queryByLabelText('Image height (ft)')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'align' }));

  expect(screen.getByRole('button', { name: /Image placement/ })).toHaveAttribute('aria-expanded', 'true');
  const height = screen.getByLabelText('Image height (ft)');
  const verticalCenter = screen.getByLabelText('Vertical center (ft)');
  const width = screen.getByLabelText('Image width (ft)');
  const horizontalCenter = screen.getByLabelText('Horizontal center (ft)');
  expect(screen.getByTestId('image-height-center-row')).toContainElement(height);
  expect(screen.getByTestId('image-height-center-row')).toContainElement(verticalCenter);
  expect(screen.getByTestId('image-width-row')).toContainElement(width);
  expect(screen.getByTestId('image-width-row')).toContainElement(horizontalCenter);
  expect(screen.getByLabelText('Image width (ft) slider')).toBeInTheDocument();
  expect(screen.getByLabelText('Image opacity slider')).toBeInTheDocument();
});

test('image placement numeric fields and sliders stay synchronized', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
      levels: [{
        id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
        floor_map: { image_url: '/plan.png', width_feet: 40, height_feet: 30, x: 0, y: 0, opacity: 0.6 },
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.click(screen.getByRole('button', { name: /Image placement/ }));
  fireEvent.change(screen.getByLabelText('Image width (ft) slider'), { target: { value: '55' } });
  expect(current.levels[0].floor_map.width_feet).toBe(55);
  expect(screen.getByLabelText('Image width (ft)')).toHaveValue(55);
  fireEvent.change(screen.getByLabelText('Horizontal center (ft)'), { target: { value: '12' } });
  expect(current.levels[0].floor_map.x).toBe(12);
  expect(screen.getByLabelText('Horizontal center (ft) slider')).toHaveValue('12');
});

test('active tool settings stay in the right side panel and Done editing is prominent', () => {
  const building = {
    id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{
      id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
    }],
  };
  render(<BlueprintLevels building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'fireplace' } });
  const settings = screen.getByLabelText('fireplace tool settings');
  expect(settings).toContainElement(screen.getByLabelText('New chimney width (ft)'));
  expect(document.querySelector('.blueprint-selection-panel')).toContainElement(settings);
  expect(document.querySelector('.blueprint-workspace-main')).not.toContainElement(settings);
  expect(screen.getByRole('button', { name: 'Done editing' })).toHaveClass('blueprint-done-action');
  expect(screen.getByText('Changes save as you work')).toBeInTheDocument();
});

test('the floor plan editor defaults back to Select each time it opens', () => {
  const building = {
    id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{
      id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
    }],
  };
  render(<BlueprintLevels building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);

  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  expect(screen.getByRole('button', { name: 'select' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'wall' } });
  expect(screen.getByLabelText('Structure tool')).toHaveValue('wall');
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  expect(screen.getByRole('button', { name: 'select' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Structure tool')).toHaveValue('');
});

test('assigning a room purpose applies contextual access defaults', () => {
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'inn', name: 'The Copper Kettle', business_type: 'tavern', coordinate_space: 'local', x: 0, y: 0,
      levels: [{
        id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
      }],
    });
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.click(screen.getByRole('button', { name: 'Select room New Room' }));

  fireEvent.change(screen.getByLabelText('Room purpose'), { target: { value: 'Bedroom' } });
  expect(screen.getByLabelText('Room access')).toHaveValue('residents');

  fireEvent.change(screen.getByLabelText('Room purpose'), { target: { value: 'Kitchen' } });
  expect(screen.getByLabelText('Room access')).toHaveValue('staff');

  fireEvent.change(screen.getByLabelText('Room access'), { target: { value: 'restricted' } });
  fireEvent.change(screen.getByLabelText('Room purpose'), { target: { value: 'Store Room' } });
  expect(screen.getByLabelText('Room access')).toHaveValue('restricted');
});

test('new and redrawn room boundaries are defined by selected walls', () => {
  const line = (id, x1, y1, x2, y2) => ({ id, type: 'line', start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5 });
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'wall-room', name: 'Wall Room', coordinate_space: 'local', x: 0, y: 0,
      levels: [{
        id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
        outline: [
          line('south', 0, 0, 20, 0), line('east', 20, 0, 20, 10),
          line('north', 20, 10, 0, 10), line('west', 0, 10, 0, 0),
        ],
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.click(screen.getByRole('button', { name: 'Rooms' }));
  ['south', 'east', 'north', 'west'].forEach(id =>
    fireEvent.click(screen.getByRole('button', { name: `Room boundary wall ${id}` })));

  expect(screen.getByText(/4 walls selected · Closed room boundary ready/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish Room' }));
  const linkedRoom = current.levels[0].rooms.find(room => room.boundary_source === 'walls');
  expect(linkedRoom.boundary_wall_ids).toEqual(['south', 'east', 'north', 'west']);

  fireEvent.click(screen.getByRole('button', { name: 'Redraw boundary' }));
  const south = screen.getByRole('button', { name: 'Room boundary wall south' });
  expect(south).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(south);
  expect(screen.getByRole('button', { name: 'Finish Room Boundary' })).toBeDisabled();
  fireEvent.click(south);
  expect(screen.getByRole('button', { name: 'Finish Room Boundary' })).toBeEnabled();
});

test('menu bar groups opening tools and keeps an in-settings type selector', () => {
  const building = {
    id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{ id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] }],
  };
  render(<BlueprintLevels building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  const openings = screen.getByRole('button', { name: 'Openings' });
  fireEvent.click(openings);
  expect(openings).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Window' }));
  expect(screen.getByLabelText('Opening type')).toHaveValue('window');
  fireEvent.change(screen.getByLabelText('Opening type'), { target: { value: 'door' } });
  expect(screen.getByLabelText('Opening type')).toHaveValue('door');
});

test('landing controls expose one linked slider per flight', () => {
  const building = {
    id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{ id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] }],
  };
  render(<BlueprintLevels building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.change(screen.getByLabelText('Vertical tool'), { target: { value: 'stairs' } });
  fireEvent.change(screen.getByLabelText('Stair shape'), { target: { value: 'landing' } });
  fireEvent.change(screen.getByLabelText('Landing count'), { target: { value: '2' } });
  expect(screen.getAllByLabelText(/Flight \d share/)).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Flight 3 share'), { target: { value: '51' } });
  expect(screen.getByLabelText('Flight 1 share')).toHaveValue('24.5');
  expect(screen.getByLabelText('Flight 2 share')).toHaveValue('24.5');
  expect(screen.getByLabelText('Flight 3 share')).toHaveValue('51');
  expect(screen.getByText(/Flight percentages place each landing/)).toBeInTheDocument();
});

test('new stair landings default to the connected stair width', () => {
  const building = {
    id: 'b', name: 'Manor', coordinate_space: 'local', x: 0, y: 0,
    levels: [{ id: 'ground', name: 'Ground floor', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] }],
  };
  render(<BlueprintLevels building={building} onChange={jest.fn()} uploadImage={jest.fn()} />);
  fireEvent.click(screen.getByText('Edit floor plan & walls'));
  fireEvent.change(screen.getByLabelText('Vertical tool'), { target: { value: 'stairs' } });
  fireEvent.change(screen.getByLabelText('Stair shape'), { target: { value: 'landing' } });
  expect(screen.getByLabelText('Stair width (ft)')).toHaveValue(3);
  expect(screen.getByLabelText('Landing depth (ft)')).toHaveValue(3);
  fireEvent.change(screen.getByLabelText('Stair width (ft)'), { target: { value: '5' } });
  expect(screen.getByLabelText('Landing depth (ft)')).toHaveValue(5);
  fireEvent.change(screen.getByLabelText('Landing depth (ft)'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Stair width (ft)'), { target: { value: '4' } });
  expect(screen.getByLabelText('Landing depth (ft)')).toHaveValue(6);
});

test('Arc and Circle tools create curved wall and footprint geometry', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  const originalPointerEvent = window.PointerEvent;
  SVGElement.prototype.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  window.PointerEvent = MouseEvent;

  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.change(screen.getByLabelText('New wall thickness (ft)'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'wall' } });
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Arc' }));
    fireEvent.click(canvas, { clientX: 5, clientY: -5 });
    fireEvent.click(canvas, { clientX: 20, clientY: -5 });
    fireEvent.click(canvas, { clientX: 12, clientY: -10 });
    expect(current.levels[0].walls[0].type).toBe('arc');
    expect(current.levels[0].walls[0].thickness).toBe(8);

    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });
    fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'footprint' } });
    fireEvent.click(screen.getByRole('button', { name: 'Curve' }));
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });
    fireEvent.click(canvas, { clientX: 20, clientY: -5 });
    expect(current.levels[0].outline[0].type).toBe('arc');
    expect(current.levels[0].outline[0].through).toEqual({ x: 20, y: 5 });

    fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'footprint' } });
    fireEvent.click(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Arc' }));
    expect(screen.getByRole('status', { name: 'Arc point 2 of 3' })).toBeInTheDocument();
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });
    expect(screen.getByRole('status', { name: 'Arc point 3 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish footprint' })).toBeDisabled();
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 10, clientY: -5 });
    expect(screen.getByTestId('blueprint-arc-preview').getAttribute('points').split(' ').length).toBeGreaterThan(2);
    fireEvent.click(canvas, { clientX: 10, clientY: -5 });
    expect(screen.getByRole('status', { name: 'Arc point 2 of 3' })).toBeInTheDocument();
    const committedWallIds = [
      ...current.levels[0].outline,
      ...current.levels[0].walls,
    ].map(wall => wall.id);
    expect(new Set(committedWallIds).size).toBe(committedWallIds.length);
    fireEvent.click(screen.getByRole('button', { name: 'Line' }));
    fireEvent.click(canvas, { clientX: 20, clientY: -20 });
    fireEvent.click(canvas, { clientX: 0, clientY: -20 });
    fireEvent.click(screen.getByRole('button', { name: 'Finish footprint' }));
    const renderedArc = current.levels[0].outline.find(wall => wall.type === 'arc');
    expect(renderedArc).toBeDefined();
    expect(wallPolyline(renderedArc, 0.4).some(point => point.y > 0.1)).toBe(true);
    expect(renderedArc.thickness).toBe(8);
    expect(current.levels[0].outline.filter(wall => wall.type === 'line').every(wall => wall.thickness === 8)).toBe(true);
    expect(current.levels[0].outline.some(wall =>
      wall.type === 'line' &&
      Math.hypot(wall.start.x - renderedArc.start.x, wall.start.y - renderedArc.start.y) < 0.001 &&
      Math.hypot(wall.end.x - renderedArc.end.x, wall.end.y - renderedArc.end.y) < 0.001
    )).toBe(false);
    expect(new Set(current.levels[0].outline.map(wall => wall.id)).size).toBe(current.levels[0].outline.length);

    fireEvent.change(screen.getByLabelText('Structure tool'), { target: { value: 'circle' } });
    fireEvent.click(canvas, { clientX: 20, clientY: -15 });
    fireEvent.click(canvas, { clientX: 25, clientY: -15 });
    expect(current.levels[0].outline).toHaveLength(4);
    expect(current.levels[0].outline.every(wall => wall.type === 'arc')).toBe(true);
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
    if (originalPointerEvent) window.PointerEvent = originalPointerEvent;
    else delete window.PointerEvent;
  }
});

test('exposed areas offer explicit building-level roof creation and visibility toggle preserves roofs', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      visible_level_id: 'upper',
      levels: [
        {
          id: 'ground',
          name: 'Ground floor',
          elevation_feet: 0,
          floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
        },
        {
          id: 'upper',
          name: 'Upper floor',
          elevation_feet: 10,
          floor_height: 10,
          corners: [{ x: 10, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 25 }, { x: 10, y: 25 }],
        },
      ],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  render(<Harness />);
  expect(current.roofs || []).toHaveLength(0);
  expect(screen.getByText('1 exposed area detected below this level.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create Roof From Exposed Area' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use new roof' }));

  expect(current.roofs).toHaveLength(1);
  expect(current.roofs[0]).toMatchObject({
    support_level_id: 'ground',
    visibility_level_id: 'upper',
    footprint: expect.any(Array),
    holes: [expect.any(Array)],
  });
  expect(current.levels[0].roofs).toBeUndefined();

  fireEvent.click(screen.getByLabelText('Show roofs'));
  expect(current.show_roofs).toBe(false);
  expect(current.roofs).toHaveLength(1);
});

test('an automatic roof promotes on edit and can be suppressed and restored without duplication', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'auto-roof', name: 'House', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /Level 1 main roof · Automatic/ }));
  fireEvent.change(screen.getByLabelText('Roof type'), { target: { value: 'hip' } });
  expect(current.roofs).toHaveLength(1);
  expect(current.roofs[0]).toMatchObject({ id: 'automatic-ground-0', type: 'hip' });
  expect(current.suppressed_automatic_roof_ids).toEqual(['automatic-ground-0']);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Level 1 main roof roof' }));
  expect(current.roofs).toHaveLength(0);
  expect(current.suppressed_automatic_roof_ids).toEqual(['automatic-ground-0']);
  fireEvent.click(screen.getByRole('button', { name: /Restore Level 1 main roof/ }));
  expect(current.suppressed_automatic_roof_ids).toEqual([]);
  expect(screen.getByRole('button', { name: /Level 1 main roof · Automatic/ })).toBeInTheDocument();
});

test('a substantially overlapping roof asks whether to keep the existing or new version', () => {
  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'roof-conflict', name: 'House', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  render(<Harness />);

  fireEvent.click(screen.getByRole('button', { name: 'Create from level footprint' }));
  expect(screen.getByRole('dialog', { name: 'Roof footprint conflict' })).toBeInTheDocument();
  expect(screen.getAllByText('Level 1 main roof · Automatic')).toHaveLength(2);
  expect(current.roofs || []).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Keep existing' }));
  expect(current.roofs || []).toHaveLength(0);
  expect(screen.getByRole('button', { name: /Level 1 main roof · Automatic/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Create from level footprint' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use new roof' }));
  expect(current.roofs).toHaveLength(1);
  expect(current.suppressed_automatic_roof_ids).toEqual(['automatic-ground-0']);
  expect(screen.queryByRole('button', { name: /Level 1 main roof · Automatic/ })).not.toBeInTheDocument();
});

test('automatic roof geometry supports hole editing with apply and cancel', async () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  SVGElement.prototype.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'roof-geometry', name: 'House', coordinate_space: 'local', x: 0, y: 0,
      levels: [{ id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  try {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Level 1 main roof · Automatic/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit footprint & holes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add hole' }));
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 5, clientY: -5 });
    fireEvent.click(canvas, { clientX: 10, clientY: -5 });
    fireEvent.click(canvas, { clientX: 7, clientY: -10 });
    fireEvent.click(screen.getByRole('button', { name: 'Finish Roof Polygon' }));
    expect(current.roofs).toHaveLength(1);
    expect(current.roofs[0].holes[0]).toHaveLength(3);

    const originalFootprint = current.roofs[0].footprint;
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit footprint & holes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redraw selected ring' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel roof geometry' }));
    expect(current.roofs[0].footprint).toEqual(originalFootprint);
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
  }
});

test('custom roofs can be traced and stored independently from levels', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  SVGElement.prototype.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });

  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Draw custom polygon' }));
    fireEvent.change(screen.getByLabelText('Roof style'), { target: { value: 'shed' } });
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 2, clientY: -2 });
    fireEvent.click(canvas, { clientX: 20, clientY: -2 });
    fireEvent.click(canvas, { clientX: 20, clientY: -20 });
    fireEvent.click(screen.getByRole('button', { name: 'Finish Roof Polygon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use new roof' }));

    expect(current.roofs).toHaveLength(1);
    expect(current.roofs[0]).toMatchObject({
      type: 'shed',
      support_level_id: 'ground',
      visibility_level_id: 'ground',
      footprint: expect.any(Array),
    });
    expect(current.levels[0].roofs).toBeUndefined();
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
  }
});

test('the Roof tool finishes a styled polygon without a roof template', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  SVGElement.prototype.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'b', name: 'Manor', coordinate_space: 'local', visible_level_id: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }] },
        { id: 'upper', name: 'Upper', elevation_feet: 10, floor_height: 10,
          corners: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }] },
      ] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.click(screen.getByRole('button', { name: 'Roof' }));
    fireEvent.change(screen.getByLabelText('Roof style'), { target: { value: 'shed' } });
    fireEvent.change(screen.getByLabelText('Pitch (°)'), { target: { value: '20' } });
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(canvas, { clientX: 10, clientY: 0 });
    fireEvent.click(canvas, { clientX: 10, clientY: -10 });
    fireEvent.click(screen.getByRole('button', { name: 'Finish Roof Polygon' }));
    expect(current.roofs[0]).toMatchObject({
      type: 'shed', pitch: 20, support_level_id: 'ground', visibility_level_id: 'upper',
    });
    expect(current.roofs[0].footprint.map(point => [point.x, Math.abs(point.y)]))
      .toEqual([[0, 0], [10, 0], [10, 10]]);
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
  }
});

test('two grid points calibrate the floor reference image around the first point', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  SVGElement.prototype.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  let current;
  function Harness() {
    const [building, setBuilding] = useState({ id: 'b', name: 'Manor', coordinate_space: 'local',
      levels: [{ id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
        floor_map: { image_url: '/map.png', width_feet: 40, height_feet: 30, x: 20, y: 15 } }] });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }
  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    expect(screen.getByLabelText('Selected element settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pick two grid points' }));
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(canvas, { clientX: 10, clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Apply image calibration' }));
    expect(current.levels[0].floor_map).toMatchObject({ width_feet: 20, height_feet: 15, x: 10, y: 7.5 });
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
  }
});

test('selected footprint endpoints can be dragged while keeping the perimeter connected', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalSvgCreatePoint = SVGSVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  const originalSetPointerCapture = SVGElement.prototype.setPointerCapture;
  const originalPointerEvent = window.PointerEvent;
  SVGSVGElement.prototype.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  SVGElement.prototype.setPointerCapture = jest.fn();
  window.PointerEvent = MouseEvent;

  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });

    const endpoint = screen.getByLabelText('Move footprint end node');
    fireEvent.pointerDown(endpoint, { pointerId: 1, clientX: 40, clientY: 0 });
    expect(SVGElement.prototype.setPointerCapture).toHaveBeenCalled();
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 32, clientY: 6 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    expect(current.levels[0].outline[0].end).toMatchObject({ x: 32, y: -6 });
    expect(current.levels[0].outline[1].start).toMatchObject({ x: 32, y: -6 });
    expect(current.levels[0].corners[1]).toMatchObject({ x: 32, y: -6 });
  } finally {
    if (originalSvgCreatePoint) SVGSVGElement.prototype.createSVGPoint = originalSvgCreatePoint;
    else delete SVGSVGElement.prototype.createSVGPoint;
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
    if (originalSetPointerCapture) SVGElement.prototype.setPointerCapture = originalSetPointerCapture;
    else delete SVGElement.prototype.setPointerCapture;
    if (originalPointerEvent) window.PointerEvent = originalPointerEvent;
    else delete window.PointerEvent;
  }
});

test('arc reference nodes can be dragged and snapped onto a wall', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalSvgCreatePoint = SVGSVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  const originalSetPointerCapture = SVGElement.prototype.setPointerCapture;
  const originalPointerEvent = window.PointerEvent;
  SVGSVGElement.prototype.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  SVGElement.prototype.setPointerCapture = jest.fn();
  window.PointerEvent = MouseEvent;

  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        outline: [
          { id: 'arc', type: 'arc', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, through: { x: 5, y: 3 }, center: { x: 5, y: -2.667 }, clockwise: true },
          { id: 'right', type: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
          { id: 'top', type: 'line', start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
          { id: 'left', type: 'line', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
        ],
        walls: [{ id: 'target', type: 'line', start: { x: 0, y: 5 }, end: { x: 10, y: 5 } }],
      }],
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 5, clientY: -3 });
    const throughNode = screen.getByLabelText('Move footprint through node');
    fireEvent.pointerDown(throughNode, { pointerId: 1, clientX: 5, clientY: -3 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: -4 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    expect(current.levels[0].outline[0].through).toEqual({ x: 5, y: 5 });
  } finally {
    if (originalSvgCreatePoint) SVGSVGElement.prototype.createSVGPoint = originalSvgCreatePoint;
    else delete SVGSVGElement.prototype.createSVGPoint;
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
    if (originalSetPointerCapture) SVGElement.prototype.setPointerCapture = originalSetPointerCapture;
    else delete SVGElement.prototype.setPointerCapture;
    if (originalPointerEvent) window.PointerEvent = originalPointerEvent;
    else delete window.PointerEvent;
  }
});

test('selected blueprint elements can be dragged, undone, and deleted', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  const originalSetPointerCapture = SVGElement.prototype.setPointerCapture;
  const originalPointerEvent = window.PointerEvent;
  SVGElement.prototype.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  SVGElement.prototype.setPointerCapture = jest.fn();
  window.PointerEvent = MouseEvent;

  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
        hatches: [{ id: 'hatch-1', x: 15, y: 15, width: 4, depth: 4 }]
      }]
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 15, clientY: -15 });
    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeEnabled();
    expect(screen.getByText('Selected hatch')).toBeInTheDocument();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 15, clientY: -15 });
    expect(SVGElement.prototype.setPointerCapture).toHaveBeenCalled();
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: -30 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 30, clientY: -30 });

    expect(current.levels[0].hatches[0]).toMatchObject({ x: 30, y: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(current.levels[0].hatches[0]).toMatchObject({ x: 15, y: 15 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(current.levels[0].hatches).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Vertical tool'), { target: { value: 'hatch' } });
    fireEvent.click(canvas, { clientX: 25, clientY: -10 });
    expect(current.levels[0].hatches).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(current.levels[0].hatches).toHaveLength(0);
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
    if (originalSetPointerCapture) SVGElement.prototype.setPointerCapture = originalSetPointerCapture;
    else delete SVGElement.prototype.setPointerCapture;
    if (originalPointerEvent) window.PointerEvent = originalPointerEvent;
    else delete window.PointerEvent;
  }
});

test('new stairs save their total rise and exterior finish', () => {
  const originalCreateSvgPoint = SVGElement.prototype.createSVGPoint;
  const originalGetScreenCtm = SVGElement.prototype.getScreenCTM;
  const originalPointerEvent = window.PointerEvent;
  SVGElement.prototype.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    };
  };
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  window.PointerEvent = MouseEvent;

  let current;
  function Harness() {
    const [building, setBuilding] = useState({
      id: 'b',
      name: 'Manor',
      coordinate_space: 'local',
      x: 0,
      y: 0,
      levels: [{
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }]
      }]
    });
    current = building;
    return <BlueprintLevels building={building} onChange={setBuilding} uploadImage={jest.fn()} />;
  }

  try {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Foundation height (ft)'), { target: { value: '3' } });
    expect(current.foundation_height_feet).toBe(3);
    fireEvent.click(screen.getByText('Edit floor plan & walls'));
    fireEvent.change(screen.getByLabelText('Vertical tool'), { target: { value: 'stairs' } });
    fireEvent.change(screen.getByLabelText('Stair finish'), { target: { value: 'wooden-exterior' } });
    expect(screen.getByLabelText('Total elevation change (ft)').value).toBe('3');
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 5, clientY: -5 });
    fireEvent.click(canvas, { clientX: 17, clientY: -5 });

    expect(current.levels[0].stairs[0]).toMatchObject({ total_rise_feet: 3, material: 'wooden-exterior' });
    fireEvent.change(screen.getByLabelText('Total elevation change (ft)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Stair finish'), { target: { value: 'stone-exterior' } });
    expect(current.levels[0].stairs[0]).toMatchObject({ total_rise_feet: 4, material: 'stone-exterior' });
    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    fireEvent.click(canvas, { clientX: 5, clientY: -5 });
    expect(screen.getByRole('button', { name: 'Rotate stairs' })).toBeInTheDocument();
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
    if (originalPointerEvent) window.PointerEvent = originalPointerEvent;
    else delete window.PointerEvent;
  }
});
