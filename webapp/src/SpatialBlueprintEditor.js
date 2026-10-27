import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import BlueprintLevels from './BlueprintLevels';

export default function SpatialBlueprintEditor({
  campaignId, space, headers, focusReference, onClose,
}) {
  const [blueprint, setBlueprint] = useState(space.independent_blueprint);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  const latest = useRef(space.independent_blueprint);
  const base = `/api/campaigns/${campaignId}/spatial-spaces/${space.id}`;

  const persist = useCallback(async value => {
    try {
      await axios.patch(base, { independent_blueprint: value }, { headers });
      setError('');
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save this independent blueprint.');
      return false;
    }
  }, [base, headers]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  const change = value => {
    latest.current = value;
    setBlueprint(value);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(value), 350);
  };

  const close = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (await persist(latest.current)) onClose?.();
  };

  if (!blueprint) return null;
  return <section className="spatial-blueprint-host" aria-label={`${space.name} blueprint editor`}>
    {error && <div className="spatial-blueprint-error" role="alert">{error}</div>}
    <BlueprintLevels
      key={`${space.id}:${focusReference?.level_id || 'default'}:${focusReference?.element_id || 'none'}`}
      building={blueprint}
      onChange={change}
      initialOpen
      initialSelection={focusReference ? { ...focusReference, element_kind: 'opening' } : null}
      onEditorClose={close}
    />
  </section>;
}
