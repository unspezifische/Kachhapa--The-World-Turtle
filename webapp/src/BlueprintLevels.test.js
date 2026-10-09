import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BlueprintLevels from './BlueprintLevels';
import { wallPolyline } from './buildingBlueprint';

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
  expect(screen.getByLabelText('Snap walls and footprint edges to 90°')).toBeChecked();
  const input = screen.getByLabelText('Upload floor image');
  fireEvent.change(input, { target: { files: [new File(['image'], 'manor.png', { type: 'image/png' })] } });
  expect(await screen.findByLabelText('Image width (ft)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Image placement/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.change(screen.getByLabelText('Image width (ft)'), { target: { value: '45' } });
  expect(current.levels[1].floor_map.width_feet).toBe(45);
  expect(current.levels[0].floor_map).toBeUndefined();
  expect(upload.mock.calls[0][1].id).toBe(current.levels[1].id);
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
  expect(screen.getByTestId('image-height-center-row')).toContainElement(height);
  expect(screen.getByTestId('image-height-center-row')).toContainElement(verticalCenter);
  expect(screen.getByTestId('image-width-row')).toContainElement(width);
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
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Arc' }));
    fireEvent.click(canvas, { clientX: 5, clientY: -5 });
    fireEvent.click(canvas, { clientX: 20, clientY: -5 });
    fireEvent.click(canvas, { clientX: 12, clientY: -10 });
    expect(current.levels[0].walls[0].type).toBe('arc');
    expect(current.levels[0].walls[0].thickness).toBe(8);

    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'footprint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Curve' }));
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });
    fireEvent.click(canvas, { clientX: 20, clientY: -5 });
    expect(current.levels[0].outline[0].type).toBe('arc');
    expect(current.levels[0].outline[0].through).toEqual({ x: 20, y: 5 });

    fireEvent.click(screen.getByRole('button', { name: 'footprint' }));
    fireEvent.click(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Arc' }));
    expect(screen.getByRole('status', { name: 'Arc point 2 of 3' })).toBeInTheDocument();
    fireEvent.click(canvas, { clientX: 20, clientY: 0 });
    expect(screen.getByRole('status', { name: 'Arc point 3 of 3' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'circle' }));
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
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 2, clientY: -2 });
    fireEvent.click(canvas, { clientX: 20, clientY: -2 });
    fireEvent.click(canvas, { clientX: 20, clientY: -20 });
    fireEvent.click(screen.getByRole('button', { name: 'Finish Roof Polygon' }));

    expect(current.roofs).toHaveLength(1);
    expect(current.roofs[0]).toMatchObject({
      type: 'custom',
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
    fireEvent.click(screen.getByRole('button', { name: 'hatch' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'stairs' }));
    fireEvent.change(screen.getByLabelText('Stair finish'), { target: { value: 'wooden-exterior' } });
    expect(screen.getByLabelText('Total elevation change (ft)').value).toBe('3');
    const canvas = screen.getByLabelText('Floor plan tracing canvas');
    fireEvent.click(canvas, { clientX: 5, clientY: -5 });
    fireEvent.click(canvas, { clientX: 17, clientY: -5 });

    expect(current.levels[0].stairs[0]).toMatchObject({ total_rise_feet: 3, material: 'wooden-exterior' });
    fireEvent.change(screen.getByLabelText('Total elevation change (ft)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Stair finish'), { target: { value: 'stone-exterior' } });
    expect(current.levels[0].stairs[0]).toMatchObject({ total_rise_feet: 4, material: 'stone-exterior' });
  } finally {
    if (originalCreateSvgPoint) SVGElement.prototype.createSVGPoint = originalCreateSvgPoint;
    else delete SVGElement.prototype.createSVGPoint;
    if (originalGetScreenCtm) SVGElement.prototype.getScreenCTM = originalGetScreenCtm;
    else delete SVGElement.prototype.getScreenCTM;
    if (originalPointerEvent) window.PointerEvent = originalPointerEvent;
    else delete window.PointerEvent;
  }
});
