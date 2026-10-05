import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Slider, TextField, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { TILE_FEET, heightmapPlacementBounds } from './settlementTiles';

export function imagePixelsToNormalizedHeights(rgba, width, height) {
  const values = new Float32Array(width * height);
  for (let index = 0; index < values.length; index++) {
    const offset = index * 4;
    values[index] = (rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722) / 255;
  }
  return values;
}

function loadImageAsHeightArray(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        resolve({
          grid_width: canvas.width,
          grid_height: canvas.height,
          values: imagePixelsToNormalizedHeights(pixels, canvas.width, canvas.height),
          preview_image: image,
          preview_url: objectUrl,
          file_name: file.name,
        });
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be decoded.'));
    };
    image.src = objectUrl;
  });
}

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const layerRotation = layer => finite(layer?.rotation_degrees ?? layer?.rotation);
const numberFieldSx = {
  '& .MuiInputLabel-root': { color: '#b8c5bd' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#8fd7e8' },
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#101914',
    color: '#f4ead2',
    '& fieldset': { borderColor: '#52675b' },
    '&:hover fieldset': { borderColor: '#789486' },
    '&.Mui-focused fieldset': { borderColor: '#70c7dc' },
  },
  '& input': { color: '#f4ead2', WebkitTextFillColor: '#f4ead2', colorScheme: 'dark' },
};

export default function HeightmapImportTool({
  bounds,
  placement,
  onPlacementChange,
  referenceLayer,
  onCommit,
  onClose,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [error, setError] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  useEffect(() => {
    if (!referenceLayer?.image_url) {
      setReferenceImage(null);
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { if (!cancelled) setReferenceImage(image); };
    image.onerror = () => { if (!cancelled) setReferenceImage(null); };
    image.src = referenceLayer.image_url;
    return () => { cancelled = true; };
  }, [referenceLayer?.image_url]);

  const viewport = useMemo(() => {
    const placementBox = heightmapPlacementBounds(placement);
    const referenceBox = referenceLayer ? {
      minX: finite(referenceLayer.origin_x) - Math.abs(finite(referenceLayer.width_feet, 1)) / 2,
      maxX: finite(referenceLayer.origin_x) + Math.abs(finite(referenceLayer.width_feet, 1)) / 2,
      minY: finite(referenceLayer.origin_y) - Math.abs(finite(referenceLayer.height_feet, 1)) / 2,
      maxY: finite(referenceLayer.origin_y) + Math.abs(finite(referenceLayer.height_feet, 1)) / 2,
    } : null;
    const candidates = [bounds, placementBox, referenceBox].filter(Boolean);
    const minX = Math.min(...candidates.map(value => value.minX));
    const maxX = Math.max(...candidates.map(value => value.maxX));
    const minY = Math.min(...candidates.map(value => value.minY));
    const maxY = Math.max(...candidates.map(value => value.maxY));
    const pad = Math.max(100, Math.max(maxX - minX, maxY - minY) * 0.05);
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [bounds, placement, referenceLayer]);

  const drawImageAtLayer = useCallback((context, image, layer, worldToCanvas, alpha) => {
    if (!image || !layer) return;
    const center = worldToCanvas(finite(layer.origin_x), finite(layer.origin_y));
    const width = Math.abs(finite(layer.width_feet, 1)) * worldToCanvas.scale;
    const height = Math.abs(finite(layer.height_feet, 1)) * worldToCanvas.scale;
    context.save();
    context.translate(center.x, center.y);
    context.rotate(-(layerRotation(layer) * Math.PI / 180));
    context.globalAlpha = alpha;
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const spanX = Math.max(1, viewport.maxX - viewport.minX);
    const spanY = Math.max(1, viewport.maxY - viewport.minY);
    const scale = Math.min(canvas.width / spanX, canvas.height / spanY);
    const usedWidth = spanX * scale, usedHeight = spanY * scale;
    const offsetX = (canvas.width - usedWidth) / 2, offsetY = (canvas.height - usedHeight) / 2;
    const worldToCanvas = (x, y) => ({
      x: offsetX + (x - viewport.minX) * scale,
      y: offsetY + (viewport.maxY - y) * scale,
    });
    worldToCanvas.scale = scale;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#121914';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#314238';
    context.lineWidth = 1;
    const firstX = Math.floor(viewport.minX / TILE_FEET) * TILE_FEET;
    const firstY = Math.floor(viewport.minY / TILE_FEET) * TILE_FEET;
    for (let x = firstX; x <= viewport.maxX; x += TILE_FEET) {
      const point = worldToCanvas(x, 0);
      context.beginPath(); context.moveTo(point.x, 0); context.lineTo(point.x, canvas.height); context.stroke();
    }
    for (let y = firstY; y <= viewport.maxY; y += TILE_FEET) {
      const point = worldToCanvas(0, y);
      context.beginPath(); context.moveTo(0, point.y); context.lineTo(canvas.width, point.y); context.stroke();
    }

    drawImageAtLayer(context, referenceImage, referenceLayer, worldToCanvas, finite(referenceLayer?.opacity, 0.55));
    if (placement?.preview_image) {
      drawImageAtLayer(context, placement.preview_image, placement, worldToCanvas, 0.58);
      const center = worldToCanvas(placement.origin_x, placement.origin_y);
      context.save();
      context.translate(center.x, center.y);
      context.rotate(-(finite(placement.rotation) * Math.PI / 180));
      context.strokeStyle = '#ff7357';
      context.lineWidth = 2;
      context.strokeRect(-placement.width_feet * scale / 2, -placement.height_feet * scale / 2,
        placement.width_feet * scale, placement.height_feet * scale);
      context.restore();
    }
    canvas._worldTransform = { scale };
  }, [drawImageAtLayer, placement, referenceImage, referenceLayer, viewport]);

  const matchReference = useCallback((base = placement) => {
    if (!base || !referenceLayer) return;
    onPlacementChange({
      ...base,
      origin_x: finite(referenceLayer.origin_x),
      origin_y: finite(referenceLayer.origin_y),
      width_feet: Math.max(1, Math.abs(finite(referenceLayer.width_feet, base.width_feet))),
      height_feet: Math.max(1, Math.abs(finite(referenceLayer.height_feet, base.height_feet))),
      rotation: layerRotation(referenceLayer),
    });
  }, [onPlacementChange, placement, referenceLayer]);

  const onFile = useCallback(async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      const loaded = await loadImageAsHeightArray(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = loaded.preview_url;
      const span = Math.max(500, Math.min(12000, Math.min(bounds.width || 1800, bounds.height || 1800) * 0.6));
      const aspect = loaded.grid_width / loaded.grid_height;
      const next = {
        ...loaded,
        origin_x: (bounds.minX + bounds.maxX) / 2,
        origin_y: (bounds.minY + bounds.maxY) / 2,
        width_feet: aspect >= 1 ? span : span * aspect,
        height_feet: aspect >= 1 ? span / aspect : span,
        rotation: 0,
        min_elevation_feet: 0,
        max_elevation_feet: 250,
      };
      if (referenceLayer) {
        next.origin_x = finite(referenceLayer.origin_x);
        next.origin_y = finite(referenceLayer.origin_y);
        next.width_feet = Math.max(1, Math.abs(finite(referenceLayer.width_feet, next.width_feet)));
        next.height_feet = Math.max(1, Math.abs(finite(referenceLayer.height_feet, next.height_feet)));
        next.rotation = layerRotation(referenceLayer);
      }
      onPlacementChange(next);
    } catch (loadError) {
      setError(loadError?.message || 'Could not read that image.');
    }
  }, [bounds, onPlacementChange, referenceLayer]);

  const updateNumber = key => event => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) onPlacementChange({ ...placement, [key]: value });
  };

  const onPointerDown = event => {
    if (!placement || !canvasRef.current?._worldTransform) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, origin_x: placement.origin_x, origin_y: placement.origin_y };
  };
  const onPointerMove = event => {
    if (!dragRef.current || !placement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const transform = canvasRef.current._worldTransform;
    const pixelsPerFootX = transform.scale * (rect.width / canvasRef.current.width);
    const pixelsPerFootY = transform.scale * (rect.height / canvasRef.current.height);
    onPlacementChange({
      ...placement,
      origin_x: dragRef.current.origin_x + (event.clientX - dragRef.current.x) / pixelsPerFootX,
      origin_y: dragRef.current.origin_y - (event.clientY - dragRef.current.y) / pixelsPerFootY,
    });
  };
  const stopDrag = () => { dragRef.current = null; };

  return (
    <Paper className="heightmap-import-panel" sx={{ mt: 1.5, p: 1.5, bgcolor: '#1e2520', color: '#cbbd9d' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: '.1em' }}>PLACE HEIGHTMAP</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: '#cbbd9d' }} aria-label="Cancel heightmap import">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} fullWidth
        sx={{ borderColor: '#526258', color: '#cbbd9d', textTransform: 'none' }}>
        {placement ? placement.file_name : 'Choose grayscale image'}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
      </Button>
      {error && <Typography variant="caption" color="error" display="block" mt={1}>{error}</Typography>}

      {placement && <>
        <canvas ref={canvasRef} width={440} height={280}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}
          style={{ width: '100%', marginTop: 10, border: '1px solid #526258', borderRadius: 4, cursor: 'grab', touchAction: 'none' }} />
        <Typography variant="caption" sx={{ color: '#9aa79e', display: 'block', mb: 1 }}>
          Drag here or directly on the terrain. The preview does not save until Apply.
        </Typography>
        {referenceLayer && <Button size="small" fullWidth startIcon={<CenterFocusStrongIcon />} onClick={() => matchReference()}
          sx={{ color: '#9dd7e5', textTransform: 'none', mb: 1 }}>Match visible reference image</Button>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField label="Center X (ft)" type="number" size="small" value={Math.round(placement.origin_x)} onChange={updateNumber('origin_x')} sx={numberFieldSx} />
          <TextField label="Center Y (ft)" type="number" size="small" value={Math.round(placement.origin_y)} onChange={updateNumber('origin_y')} sx={numberFieldSx} />
          <TextField label="Width (ft)" type="number" size="small" value={Math.round(placement.width_feet)} onChange={updateNumber('width_feet')} inputProps={{ min: 1 }} sx={numberFieldSx} />
          <TextField label="Height (ft)" type="number" size="small" value={Math.round(placement.height_feet)} onChange={updateNumber('height_feet')} inputProps={{ min: 1 }} sx={numberFieldSx} />
        </Box>
        <Typography variant="caption" display="block" mt={1}>Rotation: {finite(placement.rotation).toFixed(1)}°</Typography>
        <Slider size="small" min={-180} max={180} step={1} value={finite(placement.rotation)}
          onChange={(_, value) => onPlacementChange({ ...placement, rotation: Number(value) })} />
        <Typography variant="caption" display="block">Elevation: {placement.min_elevation_feet}–{placement.max_elevation_feet} ft</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: .5 }}>
          <TextField label="Minimum (ft)" type="number" size="small" value={placement.min_elevation_feet} onChange={updateNumber('min_elevation_feet')} sx={numberFieldSx} />
          <TextField label="Maximum (ft)" type="number" size="small" value={placement.max_elevation_feet} onChange={updateNumber('max_elevation_feet')} sx={numberFieldSx} />
        </Box>
        <Box display="flex" gap={1} mt={1.5}>
          <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={onCommit} fullWidth sx={{ textTransform: 'none' }}>Apply</Button>
          <Button variant="outlined" onClick={onClose} fullWidth sx={{ borderColor: '#526258', color: '#cbbd9d', textTransform: 'none' }}>Cancel</Button>
        </Box>
      </>}
    </Paper>
  );
}
