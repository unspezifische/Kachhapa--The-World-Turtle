import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import SpatialConnectionsEditor from './SpatialConnectionsEditor';

jest.mock('axios');
jest.mock('elkjs/lib/elk.bundled.js', () => jest.fn().mockImplementation(() => ({ layout: jest.fn() })));
jest.mock('./SpatialBlueprintEditor', () => ({ space }) => <div>blueprint:{space.name}</div>);
jest.mock('@xyflow/react', () => {
  const React = require('react');
  const flow = { setViewport: jest.fn(), fitView: jest.fn(), screenToFlowPosition: ({ x, y }) => ({ x, y }) };
  return {
    ReactFlow: ({ nodes, edges, onNodeClick, onEdgeClick, onConnect, onConnectEnd, onInit }) => {
      React.useEffect(() => onInit?.(flow), [onInit]);
      return <div aria-label="Mock spatial canvas">
        {nodes.map(node => <button key={node.id} data-node-type={node.type} onClick={event => onNodeClick?.(event, node)}>{node.data.label}</button>)}
        {edges.map(edge => <button key={edge.id} onClick={event => onEdgeClick?.(event, edge)}>edge:{edge.id}</button>)}
        <button onClick={() => onConnect?.({ source: 'physical', target: 'library' })}>Mock connect</button>
        <button onClick={event => onConnectEnd?.(event, { isValid: false, fromNode: { id: 'library' } })}>Mock empty drop</button>
      </div>;
    },
    Background: () => null, Controls: () => null, MiniMap: () => null, Handle: () => null,
    BaseEdge: () => null, EdgeLabelRenderer: ({ children }) => children,
    Position: { Left: 'left', Right: 'right' },
    getBezierPath: () => ['', 0, 0],
    useNodesState: initial => { const [value, setValue] = React.useState(initial); return [value, setValue, jest.fn()]; },
    useEdgesState: initial => { const [value, setValue] = React.useState(initial); return [value, setValue, jest.fn()]; },
  };
});

const graph = {
  root_space_id: 'physical',
  spaces: [
    { id: 'physical', name: 'Kolat Towers interior', space_type: 'physical', status: 'complete', building_id: 'tower', geometry_source: 'settlement_building', rooms: [], openings: [{ id: 'tower-door', level_id: 'third', name: 'Door', element_kind: 'door' }] },
    { id: 'annex', name: 'Planned Physical Annex', space_type: 'physical', status: 'planned', building_id: 'tower', geometry_source: 'space_blueprint', rooms: [], openings: [] },
    { id: 'library', name: 'Extradimensional Library', space_type: 'extradimensional', status: 'planned', building_id: 'tower', geometry_source: 'space_blueprint', rooms: [{ id: 'reading', name: 'Reading Room', level_id: 'ground' }], openings: [{ id: 'arch', level_id: 'ground', level_name: 'Ground floor', name: 'North Archway', element_kind: 'archway' }] },
  ],
  endpoints: [{ id: 'a', space_id: 'physical', name: 'Door' }, { id: 'b', space_id: 'library', name: 'Arch' }],
  connections: [{ id: 'connection', source_endpoint_id: 'a', destination_endpoint_id: 'b', connection_type: 'dimensional', bidirectional: true, enabled: true, status: 'draft', visible_through_opening: false, ready_for_traversal: false }],
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.includes('spatial-layout')
    ? { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } }
    : url.includes('/spatial-spaces/') ? { ...graph.spaces.find(item => url.endsWith(item.id)), independent_blueprint: null }
    : graph }));
  axios.post.mockResolvedValue({ data: { space: { id: 'new-space' } } });
  axios.put.mockResolvedValue({ data: {} });
  axios.patch.mockResolvedValue({ data: {} });
  axios.delete.mockResolvedValue({ data: {} });
});

test('opens the building spatial graph and exposes authoritative nodes and edges', async () => {
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }} headers={{ Authorization: 'Bearer test' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  expect(await screen.findByRole('button', { name: 'Kolat Towers interior' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Extradimensional Library' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Kolat Towers interior' })).toHaveAttribute('data-node-type', 'building');
  expect(screen.getByRole('button', { name: 'Planned Physical Annex' })).toHaveAttribute('data-node-type', 'placeholder');
  expect(screen.getByRole('button', { name: 'edge:connection' })).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('/api/campaigns/7/spatial-graph', expect.objectContaining({ params: { settlement_id: 10, building_id: 'tower' } }));
});

test('creates a disconnected planned space through the backend', async () => {
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }} headers={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  await screen.findByRole('button', { name: 'New space' });
  fireEvent.click(screen.getByRole('button', { name: 'New space' }));
  fireEvent.change(screen.getByLabelText('Space name'), { target: { value: 'Laboratory' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/campaigns/7/spatial-spaces', expect.objectContaining({
    name: 'Laboratory', building_id: 'tower', settlement_id: 10, status: 'planned',
  }), expect.any(Object)));
});

test('configures dragged connections with placeholder endpoints through one backend transaction', async () => {
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }} headers={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mock connect' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/campaigns/7/spatial-configured-connection', expect.objectContaining({
    source_space_id: 'physical', destination_space_id: 'library', source_endpoint_id: null, destination_endpoint_id: null,
  }), expect.any(Object)));
});

test('dropping a connection on empty canvas creates and positions a connected space', async () => {
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }} headers={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mock empty drop' }));
  fireEvent.change(screen.getByLabelText('Space name'), { target: { value: 'Private Study' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/campaigns/7/spatial-connected-space', expect.objectContaining({
    source_space_id: 'library', space: expect.objectContaining({ name: 'Private Study' }),
  }), expect.any(Object)));
  expect(axios.put).toHaveBeenCalledWith('/api/campaigns/7/spatial-layout', expect.objectContaining({
    nodes: expect.objectContaining({ 'new-space': expect.any(Object) }),
  }), expect.any(Object));
});

test('creates an independent blueprint and opens it from the selected space', async () => {
  axios.patch.mockResolvedValueOnce({ data: { ...graph.spaces[1], independent_blueprint: { id: 'space-blueprint-annex', levels: [] } } });
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }} headers={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Planned Physical Annex' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create blueprint' }));
  expect(await screen.findByText('blueprint:Planned Physical Annex')).toBeInTheDocument();
  expect(axios.patch).toHaveBeenCalledWith('/api/campaigns/7/spatial-spaces/annex', expect.objectContaining({
    independent_blueprint: expect.objectContaining({ spatial_space_id: 'annex', levels: expect.any(Array) }), status: 'draft',
  }), expect.any(Object));
});

test('binds a planned endpoint to a stable blueprint opening', async () => {
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }} headers={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  fireEvent.click(await screen.findByRole('button', { name: 'edge:connection' }));
  fireEvent.mouseDown(screen.getByLabelText('destination endpoint opening').querySelector('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'Ground floor · North Archway' }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/campaigns/7/spatial-endpoints/b', {
    status: 'positioned', geometry_reference: {
      source: 'space_blueprint', level_id: 'ground', element_kind: 'archway', element_id: 'arch',
    },
  }, expect.any(Object)));
});

test('routes a physical space to its canonical building blueprint', async () => {
  const openCanonical = jest.fn(() => true);
  render(<SpatialConnectionsEditor campaignId="7" settlementId={10} building={{ id: 'tower', name: 'Kolat Towers' }}
    headers={{}} onOpenCanonicalBlueprint={openCanonical} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open graph editor' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Kolat Towers interior' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create blueprint' }));
  expect(openCanonical).toHaveBeenCalledWith(expect.objectContaining({ id: 'physical' }), null);
});
