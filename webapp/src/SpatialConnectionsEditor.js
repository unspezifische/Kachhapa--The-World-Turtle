import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap,
  Position, ReactFlow, getBezierPath, useEdgesState, useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Select, TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import { createBlueprintBuilding } from './settlementEditor';
import './SpatialConnectionsEditor.css';

const SpatialBlueprintEditor = lazy(() => import('./SpatialBlueprintEditor'));

const elk = new ELK();
const NODE_WIDTH = 238;
const NODE_HEIGHT = 132;

function SpaceNode({ data, selected }) {
  const warning = data.warnings?.length > 0;
  return <article className={`spatial-node spatial-node--${data.variant} ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} className="spatial-handle" />
    <header>
      <span className="spatial-node-kicker">{data.kicker}</span>
      {warning && <span className="spatial-node-warning" title={data.warnings.join(' · ')}>!</span>}
    </header>
    <strong>{data.label}</strong>
    <p>{data.status} · {data.roomCount} room{data.roomCount === 1 ? '' : 's'}</p>
    <footer>
      <span>{data.entranceCount} entrance{data.entranceCount === 1 ? '' : 's'}</span>
      {data.roomCount > 0 && <button type="button" onClick={event => { event.stopPropagation(); data.onToggle?.(); }}>
        {data.collapsed ? 'Reveal rooms' : 'Hide rooms'}
      </button>}
    </footer>
    <Handle type="source" position={Position.Right} className="spatial-handle" />
  </article>;
}

function RoomNode({ data, selected }) {
  return <article className={`spatial-room-node ${selected ? 'is-selected' : ''}`}>
    <span>ROOM · {data.levelName || data.levelId || 'LEVEL'}</span>
    <strong>{data.label}</strong>
    <small>{data.purpose || 'Unassigned purpose'}</small>
  </article>;
}

function SpatialEdge(props) {
  const [path, labelX, labelY] = getBezierPath(props);
  const style = {
    ...props.style,
    strokeDasharray: props.data?.connectionType === 'dimensional' ? '9 7'
      : props.data?.connectionType === 'teleportation' ? '2 7' : undefined,
  };
  return <>
    <BaseEdge {...props} path={path} style={style} markerEnd={props.markerEnd} />
    <EdgeLabelRenderer>
      <span className={`spatial-edge-label ${props.data?.warning ? 'is-warning' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>
        {props.data?.connectionType}{props.data?.warning ? ' · unresolved' : ''}
      </span>
    </EdgeLabelRenderer>
  </>;
}

const nodeTypes = { building: SpaceNode, space: SpaceNode, placeholder: SpaceNode, external: SpaceNode, room: RoomNode };
const edgeTypes = { spatial: SpatialEdge };

function endpointOptions(graph, spaceId) {
  return (graph?.endpoints || []).filter(endpoint => endpoint.space_id === spaceId);
}

function GraphDialog({ state, graph, onClose, onSubmit, busy }) {
  const [form, setForm] = useState(state?.form || {});
  useEffect(() => setForm(state?.form || {}), [state]);
  if (!state) return null;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const sourceOptions = endpointOptions(graph, state.sourceSpaceId);
  const destinationOptions = endpointOptions(graph, state.destinationSpaceId);
  const isSpace = state.kind === 'space';
  return <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
    <DialogTitle>{isSpace ? (state.sourceSpaceId ? 'Create connected space' : 'Create spatial space') : 'Configure spatial connection'}</DialogTitle>
    <DialogContent className="spatial-dialog-fields">
      {isSpace ? <>
        <TextField autoFocus label="Space name" value={form.name || ''} onChange={event => set('name', event.target.value)} fullWidth />
        <Select aria-label="Space type" value={form.space_type || 'extradimensional'} onChange={event => set('space_type', event.target.value)} fullWidth>
          <MenuItem value="physical">Physical annex / interior</MenuItem>
          <MenuItem value="extradimensional">Extradimensional</MenuItem>
        </Select>
        <TextField label="Description" multiline minRows={2} value={form.description || ''} onChange={event => set('description', event.target.value)} fullWidth />
      </> : <>
        <label>Source endpoint
          <Select value={form.source_endpoint_id || ''} onChange={event => set('source_endpoint_id', event.target.value)} fullWidth>
            <MenuItem value="">Create placeholder endpoint</MenuItem>
            {sourceOptions.map(item => <MenuItem key={item.id} value={item.id}>{item.name || item.endpoint_type}</MenuItem>)}
          </Select>
        </label>
        <label>Destination endpoint
          <Select value={form.destination_endpoint_id || ''} onChange={event => set('destination_endpoint_id', event.target.value)} fullWidth>
            <MenuItem value="">Create placeholder endpoint</MenuItem>
            {destinationOptions.map(item => <MenuItem key={item.id} value={item.id}>{item.name || item.endpoint_type}</MenuItem>)}
          </Select>
        </label>
      </>}
      {state.sourceSpaceId && <>
        <Select aria-label="Connection type" value={form.connection_type || 'dimensional'} onChange={event => set('connection_type', event.target.value)} fullWidth>
          <MenuItem value="physical">Physical</MenuItem>
          <MenuItem value="dimensional">Dimensional</MenuItem>
          <MenuItem value="teleportation">Teleportation</MenuItem>
        </Select>
        <FormControlLabel control={<Checkbox checked={form.bidirectional !== false} onChange={event => set('bidirectional', event.target.checked)} />} label="Bidirectional" />
      </>}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="contained" disabled={busy || (isSpace && !form.name?.trim())} onClick={() => onSubmit(form)}>
        {busy ? 'Saving…' : isSpace ? 'Create space' : 'Create connection'}
      </Button>
    </DialogActions>
  </Dialog>;
}

export default function SpatialConnectionsEditor({ campaignId, settlementId, building, headers, onOpenCanonicalBlueprint }) {
  const [open, setOpen] = useState(false);
  const [graph, setGraph] = useState(null);
  const [viewMode, setViewMode] = useState('space');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [search, setSearch] = useState('');
  const [connectionFilter, setConnectionFilter] = useState('all');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [flow, setFlow] = useState(null);
  const [blueprintEditor, setBlueprintEditor] = useState(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const pendingDropRef = useRef(null);

  const base = `/api/campaigns/${campaignId}`;
  const query = useMemo(() => ({ settlement_id: settlementId, building_id: building.id }), [building.id, settlementId]);

  const load = useCallback(async () => {
    if (!campaignId || !settlementId || !building?.id) return;
    setStatus('Loading spatial architecture…');
    try {
      const [graphResponse, layoutResponse] = await Promise.all([
        axios.get(`${base}/spatial-graph`, { headers, params: query }),
        axios.get(`${base}/spatial-layout`, { headers, params: { ...query, view: viewMode } }),
      ]);
      setGraph(graphResponse.data);
      viewportRef.current = layoutResponse.data.viewport || { x: 0, y: 0, zoom: 1 };
      setStatus('');
    } catch (error) {
      setStatus(error.response?.data?.message || 'Unable to load spatial connections. Apply the spatial migrations first.');
    }
  }, [base, building?.id, campaignId, headers, query, settlementId, viewMode]);

  useEffect(() => { if (open) load(); }, [load, open]);

  const connectionCounts = useMemo(() => {
    const values = new Map();
    (graph?.endpoints || []).forEach(endpoint => values.set(endpoint.space_id, 0));
    (graph?.connections || []).forEach(connection => {
      const source = graph.endpoints.find(item => item.id === connection.source_endpoint_id);
      const destination = graph.endpoints.find(item => item.id === connection.destination_endpoint_id);
      if (source) values.set(source.space_id, (values.get(source.space_id) || 0) + 1);
      if (destination) values.set(destination.space_id, (values.get(destination.space_id) || 0) + 1);
    });
    return values;
  }, [graph]);

  useEffect(() => {
    if (!graph) return;
    let cancelled = false;
    axios.get(`${base}/spatial-layout`, { headers, params: { ...query, view: viewMode } }).then(({ data: layout }) => {
      if (cancelled) return;
      const positions = layout.nodes || {};
      const spaceNodes = graph.spaces.map((space, index) => {
        const isRoot = space.id === graph.root_space_id;
        const external = String(space.building_id || building.id) !== String(building.id);
        const warnings = [];
        const entrances = connectionCounts.get(space.id) || 0;
        if (!isRoot && entrances === 0) warnings.push('No entrances');
        const unresolved = graph.connections.filter(connection => !connection.ready_for_traversal).filter(connection => {
          const ids = graph.endpoints.filter(endpoint => endpoint.space_id === space.id).map(endpoint => endpoint.id);
          return ids.includes(connection.source_endpoint_id) || ids.includes(connection.destination_endpoint_id);
        }).length;
        if (unresolved) warnings.push(`${unresolved} unresolved connection${unresolved === 1 ? '' : 's'}`);
        const roomCount = space.rooms?.length || 0;
        return {
          id: space.id,
          type: isRoot ? 'building' : external ? 'external' : space.status === 'planned' ? 'placeholder' : 'space',
          position: positions[space.id] || { x: 40 + (index % 3) * 300, y: 60 + Math.floor(index / 3) * 210 },
          data: {
            label: space.name, status: space.status, roomCount, entranceCount: entrances, warnings,
            kicker: isRoot ? 'PHYSICAL STRUCTURE' : external ? 'EXTERNAL DESTINATION' : space.space_type.toUpperCase(),
            variant: isRoot ? 'building' : external ? 'external' : space.space_type,
            collapsed: collapsed.has(space.id),
            onToggle: () => setCollapsed(current => { const next = new Set(current); next.has(space.id) ? next.delete(space.id) : next.add(space.id); return next; }),
          },
        };
      });
      const roomNodes = viewMode === 'room' ? graph.spaces.flatMap(space => collapsed.has(space.id) ? [] : (space.rooms || []).map((room, index) => ({
        id: `room:${space.id}:${room.id}`, type: 'room', parentSpaceId: space.id,
        position: positions[`room:${space.id}:${room.id}`] || {
          x: (spaceNodes.find(item => item.id === space.id)?.position.x || 0) + 270,
          y: (spaceNodes.find(item => item.id === space.id)?.position.y || 0) + index * 92,
        },
        data: { label: room.name, purpose: room.purpose, levelId: room.level_id }, draggable: true,
      }))) : [];
      const endpointById = new Map(graph.endpoints.map(item => [item.id, item]));
      const graphEdges = graph.connections.map(connection => {
        const source = endpointById.get(connection.source_endpoint_id);
        const destination = endpointById.get(connection.destination_endpoint_id);
        return {
          id: connection.id, source: source?.space_id, target: destination?.space_id, type: 'spatial',
          animated: connection.enabled && !connection.ready_for_traversal,
          hidden: connectionFilter !== 'all' && connection.connection_type !== connectionFilter,
          markerEnd: connection.bidirectional ? undefined : { type: 'arrowclosed', color: '#dbc06f' },
          style: { stroke: connection.enabled ? '#dbc06f' : '#6f746f', strokeWidth: 2, opacity: connection.enabled ? 1 : .45 },
          data: { connectionType: connection.connection_type, warning: !connection.ready_for_traversal },
        };
      }).filter(edge => edge.source && edge.target);
      setNodes([...spaceNodes, ...roomNodes]);
      setEdges(graphEdges);
      requestAnimationFrame(() => flow?.setViewport(layout.viewport || viewportRef.current));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [base, building.id, collapsed, connectionCounts, connectionFilter, flow, graph, headers, query, setEdges, setNodes, viewMode]);

  const saveLayout = useCallback(async (nextNodes = nodes, viewport = viewportRef.current) => {
    const positions = Object.fromEntries(nextNodes.map(node => [node.id, { x: node.position.x, y: node.position.y }]));
    try {
      await axios.put(`${base}/spatial-layout`, { nodes: positions, viewport }, { headers, params: { ...query, view: viewMode } });
      setStatus('Layout saved');
    } catch (error) { setStatus(error.response?.data?.message || 'Unable to save graph layout.'); }
  }, [base, headers, nodes, query, viewMode]);

  const autoLayout = useCallback(async () => {
    const result = await elk.layout({
      id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '55', 'elk.layered.spacing.nodeNodeBetweenLayers': '90' },
      children: nodes.map(node => ({ id: node.id, width: node.type === 'room' ? 190 : NODE_WIDTH, height: node.type === 'room' ? 70 : NODE_HEIGHT })),
      edges: edges.filter(edge => !edge.hidden).map(edge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    });
    const positions = new Map((result.children || []).map(item => [item.id, { x: item.x, y: item.y }]));
    const next = nodes.map(node => ({ ...node, position: positions.get(node.id) || node.position }));
    setNodes(next);
    await saveLayout(next);
    requestAnimationFrame(() => flow?.fitView({ padding: .16, duration: 500 }));
  }, [edges, flow, nodes, saveLayout, setNodes]);

  const refresh = async message => { await load(); if (message) setStatus(message); };

  const submitDialog = async form => {
    setBusy(true);
    try {
      if (dialog.kind === 'space') {
        if (dialog.sourceSpaceId) {
          const response = await axios.post(`${base}/spatial-connected-space`, {
            source_space_id: dialog.sourceSpaceId,
            space: { name: form.name.trim(), space_type: form.space_type || 'extradimensional', status: 'planned', metadata: { description: form.description || '' } },
            connection: { connection_type: form.connection_type || 'dimensional', bidirectional: form.bidirectional !== false, status: 'draft' },
          }, { headers });
          const origin = nodes.find(node => node.id === dialog.sourceSpaceId)?.position || { x: 40, y: 60 };
          const position = pendingDropRef.current || { x: origin.x + 310, y: origin.y + 40 };
          pendingDropRef.current = null;
          await axios.put(`${base}/spatial-layout`, {
            nodes: {
              ...Object.fromEntries(nodes.map(node => [node.id, { x: node.position.x, y: node.position.y }])),
              [response.data.space.id]: position,
            },
            viewport: viewportRef.current,
          }, { headers, params: { ...query, view: viewMode } });
        } else {
          await axios.post(`${base}/spatial-spaces`, {
            name: form.name.trim(), space_type: form.space_type || 'extradimensional', status: 'planned',
            settlement_id: settlementId, building_id: building.id, metadata: { description: form.description || '' },
          }, { headers });
        }
      } else {
        await axios.post(`${base}/spatial-configured-connection`, {
          source_space_id: dialog.sourceSpaceId, destination_space_id: dialog.destinationSpaceId,
          source_endpoint_id: form.source_endpoint_id || null,
          destination_endpoint_id: form.destination_endpoint_id || null,
          connection: { connection_type: form.connection_type || 'dimensional', bidirectional: form.bidirectional !== false, status: 'draft' },
        }, { headers });
      }
      setDialog(null);
      await refresh('Spatial architecture updated');
    } catch (error) { setStatus(error.response?.data?.message || 'Unable to save spatial architecture.'); }
    finally { setBusy(false); }
  };

  const onConnect = connection => setDialog({ kind: 'connection', sourceSpaceId: connection.source, destinationSpaceId: connection.target, form: {} });
  const onConnectEnd = (event, connectionState) => {
    if (connectionState?.isValid || !connectionState?.fromNode?.id || connectionState.fromNode.id.startsWith('room:')) return;
    const client = event.changedTouches?.[0] || event;
    pendingDropRef.current = flow?.screenToFlowPosition({ x: client.clientX, y: client.clientY });
    setDialog({ kind: 'space', sourceSpaceId: connectionState.fromNode.id, form: {} });
  };

  const selectedSpace = graph?.spaces.find(item => item.id === selectedNodeId);
  const selectedConnection = graph?.connections.find(item => item.id === selectedEdgeId);
  const selectedEndpoints = selectedConnection ? {
    source: graph.endpoints.find(item => item.id === selectedConnection.source_endpoint_id),
    destination: graph.endpoints.find(item => item.id === selectedConnection.destination_endpoint_id),
  } : null;

  const renameSpace = async name => {
    await axios.patch(`${base}/spatial-spaces/${selectedSpace.id}`, { name }, { headers });
    await refresh('Space renamed');
  };
  const deleteSelectedSpace = async () => {
    if (!window.confirm(`Delete ${selectedSpace.name}? Dependent endpoints must be removed first.`)) return;
    try { await axios.delete(`${base}/spatial-spaces/${selectedSpace.id}`, { headers }); setSelectedNodeId(null); await refresh('Space deleted'); }
    catch (error) { setStatus(error.response?.data?.message || 'Unable to delete space.'); }
  };
  const updateConnection = async patch => {
    await axios.patch(`${base}/spatial-connections/${selectedConnection.id}`, patch, { headers });
    await refresh('Connection updated');
  };
  const openBlueprint = async (space, focusReference = null) => {
    if (space.geometry_source === 'settlement_building') {
      if (!onOpenCanonicalBlueprint) {
        setStatus('This structure does not have an editable custom blueprint.');
        return;
      }
      const opened = onOpenCanonicalBlueprint(space, focusReference);
      if (opened === false) {
        setStatus('The referenced physical structure does not have an editable custom blueprint.');
        return;
      }
      setOpen(false);
      return;
    }
    try {
      const response = await axios.get(`${base}/spatial-spaces/${space.id}`, { headers });
      let fullSpace = response.data;
      if (!fullSpace.independent_blueprint) {
        const starter = createBlueprintBuilding({ x: 0, y: 0 });
        const blueprint = {
          ...starter, id: `space-blueprint-${space.id}`, name: space.name,
          x: 0, y: 0, elevation: 0, coordinate_space: 'local', spatial_space_id: space.id,
        };
        const created = await axios.patch(`${base}/spatial-spaces/${space.id}`,
          { independent_blueprint: blueprint, status: 'draft' }, { headers });
        fullSpace = created.data;
      }
      setBlueprintEditor({ space: fullSpace, focusReference });
    } catch (error) {
      setStatus(error.response?.data?.message || 'Unable to open this spatial blueprint.');
    }
  };
  const bindEndpoint = async (endpoint, space, openingKey) => {
    const opening = (space.openings || []).find(item => `${item.level_id}:${item.id}` === openingKey);
    const patch = opening ? {
      status: 'positioned',
      geometry_reference: {
        source: space.geometry_source, level_id: opening.level_id,
        element_kind: opening.element_kind, element_id: opening.id,
      },
    } : { status: 'planned', geometry_reference: null };
    try {
      await axios.patch(`${base}/spatial-endpoints/${endpoint.id}`, patch, { headers });
      await refresh(opening ? 'Endpoint bound to blueprint opening' : 'Endpoint returned to planned status');
    } catch (error) {
      setStatus(error.response?.data?.message || 'Unable to update the endpoint binding.');
    }
  };
  const deleteConnection = async () => {
    if (!window.confirm('Delete this spatial connection? Endpoints will remain available.')) return;
    await axios.delete(`${base}/spatial-connections/${selectedConnection.id}`, { headers });
    setSelectedEdgeId(null); await refresh('Connection deleted');
  };

  const searchedNodes = nodes.map(node => ({ ...node, hidden: search.trim() && !String(node.data.label).toLowerCase().includes(search.trim().toLowerCase()) }));

  if (!open) return <section className="spatial-launcher">
    <div><span>Impossible architecture</span><strong>Spatial Connections</strong><p>Plan physical and extradimensional interiors as a navigable graph.</p></div>
    <Button variant="outlined" startIcon={<AccountTreeIcon />} onClick={() => setOpen(true)}>Open graph editor</Button>
  </section>;

  return <Dialog open maxWidth={false} fullWidth onClose={() => setOpen(false)}
    PaperProps={{ className: 'spatial-editor-dialog' }}>
    <section className="spatial-editor" aria-label="Spatial Connections graph editor">
    <header className="spatial-editor-toolbar">
      <div><span>ARCHITECTURAL GRAPH</span><h3>{building.name}</h3></div>
      <div className="spatial-toolbar-actions">
        <div className="spatial-search"><SearchIcon /><input aria-label="Search spatial graph" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a space…" /></div>
        <Select size="small" value={viewMode} onChange={event => setViewMode(event.target.value)} aria-label="Graph view">
          <MenuItem value="space">Space view</MenuItem><MenuItem value="room">Room view</MenuItem>
        </Select>
        <Select size="small" value={connectionFilter} onChange={event => setConnectionFilter(event.target.value)} aria-label="Connection filter">
          <MenuItem value="all">All connections</MenuItem><MenuItem value="physical">Physical</MenuItem>
          <MenuItem value="dimensional">Dimensional</MenuItem><MenuItem value="teleportation">Teleportation</MenuItem>
        </Select>
        <Button size="small" startIcon={<AutoFixHighIcon />} onClick={autoLayout}>Arrange</Button>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'space', form: {} })}>New space</Button>
        <Button size="small" onClick={() => setOpen(false)}>Close</Button>
      </div>
    </header>
    <div className="spatial-editor-body">
      <div className="spatial-canvas">
        <ReactFlow nodes={searchedNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd}
          onInit={setFlow} onNodeClick={(_, node) => { if (!node.id.startsWith('room:')) setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
          onNodeDoubleClick={(_, node) => { const space = graph.spaces.find(item => item.id === node.id); if (space) openBlueprint(space); }}
          onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          onNodeDragStop={(_, dragged) => saveLayout(nodes.map(node => node.id === dragged.id ? { ...node, position: dragged.position } : node))}
          onMoveEnd={(_, viewport) => { viewportRef.current = viewport; saveLayout(nodes, viewport); }}
          fitView minZoom={.2} maxZoom={1.8} connectionLineStyle={{ stroke: '#dbc06f', strokeWidth: 2 }}>
          <Background color="#4d543f" gap={28} size={1} />
          <MiniMap pannable zoomable nodeColor={node => node.type === 'building' ? '#d6b655' : node.type === 'placeholder' ? '#6e6652' : '#476d62'} />
          <Controls />
        </ReactFlow>
        {status && <div className="spatial-status" role="status">{status}</div>}
      </div>
      <aside className="spatial-properties" aria-label="Spatial selection properties">
        {!selectedSpace && !selectedConnection && <div className="spatial-empty-selection"><AccountTreeIcon /><strong>Select an element</strong><p>Choose a space or connection to inspect it. Drag between node handles to create a connection.</p></div>}
        {selectedSpace && <>
          <span className="spatial-properties-kicker">SELECTED SPACE</span>
          <TextField label="Name" size="small" defaultValue={selectedSpace.name} key={selectedSpace.id} onBlur={event => { if (event.target.value.trim() && event.target.value !== selectedSpace.name) renameSpace(event.target.value.trim()); }} />
          <dl><div><dt>Type</dt><dd>{selectedSpace.space_type}</dd></div><div><dt>Status</dt><dd>{selectedSpace.status}</dd></div>
            <div><dt>Rooms</dt><dd>{selectedSpace.rooms?.length || 0}</dd></div><div><dt>Entrances</dt><dd>{connectionCounts.get(selectedSpace.id) || 0}</dd></div></dl>
          <Button variant="outlined" onClick={() => setDialog({ kind: 'space', sourceSpaceId: selectedSpace.id, form: {} })}>Add connected space</Button>
          <Button variant="contained" onClick={() => openBlueprint(selectedSpace)}>{selectedSpace.rooms?.length ? 'Open blueprint' : 'Create blueprint'}</Button>
          {selectedSpace.id !== graph.root_space_id && <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={deleteSelectedSpace}>Delete space</Button>}
        </>}
        {selectedConnection && <>
          <span className="spatial-properties-kicker">SELECTED CONNECTION</span>
          <h4>{selectedConnection.connection_type} connection</h4>
          <p>{selectedEndpoints?.source?.name || 'Planned source'} → {selectedEndpoints?.destination?.name || 'Planned destination'}</p>
          <label>Connection type<Select size="small" value={selectedConnection.connection_type} onChange={event => updateConnection({ connection_type: event.target.value })} fullWidth>
            <MenuItem value="physical">Physical</MenuItem><MenuItem value="dimensional">Dimensional</MenuItem><MenuItem value="teleportation">Teleportation</MenuItem>
          </Select></label>
          <FormControlLabel control={<Checkbox checked={selectedConnection.bidirectional} onChange={event => updateConnection({ bidirectional: event.target.checked })} />} label="Bidirectional" />
          <FormControlLabel control={<Checkbox checked={selectedConnection.enabled} onChange={event => updateConnection({ enabled: event.target.checked })} />} label="Enabled" />
          <label>Workflow status<Select size="small" value={selectedConnection.status} onChange={event => updateConnection({ status: event.target.value })} fullWidth>
            <MenuItem value="draft">Draft</MenuItem><MenuItem value="ready">Ready</MenuItem>
          </Select></label>
          <FormControlLabel control={<Checkbox checked={selectedConnection.visible_through_opening} onChange={event => updateConnection({ visible_through_opening: event.target.checked })} />} label="Visible through opening" />
          <div className={`spatial-readiness ${selectedConnection.ready_for_traversal ? 'is-ready' : ''}`}><span />{selectedConnection.ready_for_traversal ? 'Ready for traversal' : 'Draft or unresolved'}</div>
          {['source', 'destination'].map(side => {
            const endpoint = selectedEndpoints?.[side];
            const space = graph.spaces.find(item => item.id === endpoint?.space_id);
            const current = endpoint?.geometry_reference;
            const value = current ? `${current.level_id}:${current.element_id}` : '';
            return endpoint && space ? <section className="spatial-endpoint-binding" key={side}>
              <strong>{side === 'source' ? 'Source' : 'Destination'} opening</strong>
              <Select size="small" aria-label={`${side} endpoint opening`} value={value} displayEmpty onChange={event => bindEndpoint(endpoint, space, event.target.value)} fullWidth>
                <MenuItem value="">Planned / unbound</MenuItem>
                {(space.openings || []).map(opening => <MenuItem key={`${opening.level_id}:${opening.id}`} value={`${opening.level_id}:${opening.id}`}>
                  {opening.level_name || opening.level_id} · {opening.name}
                </MenuItem>)}
              </Select>
              {current && <Button size="small" onClick={() => openBlueprint(space, current)}>Locate in blueprint</Button>}
              {!space.openings?.length && <small>Create a doorway or archway in this space's blueprint before binding it.</small>}
            </section> : null;
          })}
          <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={deleteConnection}>Delete connection</Button>
        </>}
      </aside>
    </div>
    <GraphDialog state={dialog} graph={graph} onClose={() => setDialog(null)} onSubmit={submitDialog} busy={busy} />
    {blueprintEditor && <Suspense fallback={null}><SpatialBlueprintEditor
      campaignId={campaignId} headers={headers} space={blueprintEditor.space}
      focusReference={blueprintEditor.focusReference}
      onClose={() => { setBlueprintEditor(null); refresh('Blueprint saved'); }}
    /></Suspense>}
    </section>
  </Dialog>;
}
