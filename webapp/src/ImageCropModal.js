import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import './ImageCropModal.css';

const STAGE_SIZE = 340;

const isGif = file => file?.type === 'image/gif' || /\.gif$/i.test(file?.name || '');

export default function ImageCropModal({ file, show, title = 'Crop & position image', onCancel, onConfirm, busy = false }) {
  const [image, setImage] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [crop, setCrop] = useState(null);
  const dragRef = useRef(null);
  const animated = isGif(file);

  useEffect(() => {
    if (!show || !file) return undefined;
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    if (animated) return () => URL.revokeObjectURL(url);
    const nextImage = new Image();
    nextImage.onload = () => {
      const size = Math.min(nextImage.width, nextImage.height);
      setImage(nextImage);
      setCrop({ x: (nextImage.width - size) / 2, y: (nextImage.height - size) / 2, size });
    };
    nextImage.src = url;
    return () => URL.revokeObjectURL(url);
  }, [show, file, animated]);

  useEffect(() => {
    if (show) return;
    setImage(null);
    setSourceUrl('');
    setCrop(null);
  }, [show]);

  const scale = image ? STAGE_SIZE / Math.max(image.width, image.height) : 1;
  const renderedWidth = image ? image.width * scale : 0;
  const renderedHeight = image ? image.height * scale : 0;
  const offsetX = (STAGE_SIZE - renderedWidth) / 2;
  const offsetY = (STAGE_SIZE - renderedHeight) / 2;
  const renderedCrop = crop && {
    left: offsetX + crop.x * scale,
    top: offsetY + crop.y * scale,
    size: crop.size * scale,
  };

  const beginDrag = event => {
    if (!crop) return;
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startY: event.clientY, crop: { ...crop } };
    window.addEventListener('pointermove', moveCrop);
    window.addEventListener('pointerup', endDrag);
  };

  const moveCrop = event => {
    const drag = dragRef.current;
    if (!drag || !image) return;
    const x = Math.max(0, Math.min(image.width - drag.crop.size, drag.crop.x + (event.clientX - drag.startX) / scale));
    const y = Math.max(0, Math.min(image.height - drag.crop.size, drag.crop.y + (event.clientY - drag.startY) / scale));
    setCrop({ ...drag.crop, x, y });
  };

  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', moveCrop);
    window.removeEventListener('pointerup', endDrag);
  };

  const zoom = event => {
    if (!image || !crop) return;
    const nextSize = Number(event.target.value);
    const centerX = crop.x + crop.size / 2;
    const centerY = crop.y + crop.size / 2;
    setCrop({
      size: nextSize,
      x: Math.max(0, Math.min(image.width - nextSize, centerX - nextSize / 2)),
      y: Math.max(0, Math.min(image.height - nextSize, centerY - nextSize / 2)),
    });
  };

  const confirm = async () => {
    if (animated) {
      await onConfirm(file);
      return;
    }
    if (!image || !crop) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 512, 512);
    canvas.toBlob(async blob => {
      if (!blob) return;
      await onConfirm(new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}-cropped.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  return (
    <Modal show={show} onHide={busy ? undefined : onCancel} centered size="lg" className="image-crop-modal">
      <Modal.Header closeButton={!busy}><Modal.Title>{title}</Modal.Title></Modal.Header>
      <Modal.Body>
        {animated ? (
          <div className="image-crop-gif">
            <img src={sourceUrl} alt="Animated upload preview" />
            <div><strong>Animated GIF detected</strong><p>Its animation will be preserved. Cropping animated frames in the browser would flatten the motion, so this GIF will upload as shown.</p></div>
          </div>
        ) : image && renderedCrop ? (
          <div className="image-crop-layout">
            <div className="image-crop-stage" style={{ width: STAGE_SIZE, height: STAGE_SIZE }}>
              <img src={sourceUrl} alt="Image being positioned" style={{ width: renderedWidth, height: renderedHeight, left: offsetX, top: offsetY }} draggable={false} />
              <div className="image-crop-box" style={{ left: renderedCrop.left, top: renderedCrop.top, width: renderedCrop.size, height: renderedCrop.size }} onPointerDown={beginDrag}>
                <span>Drag to position</span>
              </div>
            </div>
            <div className="image-crop-controls">
              <p>Move the square over the part of the image you want shown. The saved portrait is a 512 × 512 square.</p>
              <Form.Label htmlFor="crop-zoom">Zoom</Form.Label>
              <Form.Range id="crop-zoom" aria-label="Crop zoom" min={Math.max(32, Math.min(image.width, image.height) * 0.2)} max={Math.min(image.width, image.height)} step="1" value={crop.size} onChange={zoom} />
              <div className="image-crop-preview"><img src={sourceUrl} alt="Crop preview" style={{ width: image.width * (132 / crop.size), height: image.height * (132 / crop.size), left: -crop.x * (132 / crop.size), top: -crop.y * (132 / crop.size) }} /></div>
            </div>
          </div>
        ) : <p>Preparing your image…</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={confirm} disabled={busy || (!animated && !crop)}>{busy ? 'Uploading…' : animated ? 'Keep animation & upload' : 'Use this crop'}</Button>
      </Modal.Footer>
    </Modal>
  );
}
