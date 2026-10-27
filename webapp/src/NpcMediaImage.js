import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function NpcMediaImage({ asset, headers, size = 128, alt = '', style, ...props }) {
  const [src, setSrc] = useState(null);
  const url = asset?.url;
  useEffect(() => {
    setSrc(null); if (!url) return;
    let active = true, objectUrl;
    axios.get(url, { headers, params: { size }, responseType: 'blob' }).then(({ data }) => {
      if (active) { objectUrl = URL.createObjectURL(data); setSrc(objectUrl); }
    }).catch(() => { if (active) setSrc(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, headers, size]);
  return src ? <img src={src} alt={alt} style={{ maxWidth: '100%', ...style }} {...props} /> : <span role="img" aria-label={alt || 'No portrait'}>◉</span>;
}
