import React from 'react';
import { moonIllumination, moonLitPath, moonPhaseFraction, moonPhaseName, selectedMoon } from './settlementMoon';

export default function SettlementMoonPhase({ celestial }) {
  const moon = selectedMoon(celestial);
  if (!moon) return null;
  const fraction = moonPhaseFraction(moon);
  const illumination = Math.round(moonIllumination(moon) * 100);
  const phaseName = moonPhaseName(moon);
  const label = `${moon.name || 'Moon'} — ${phaseName} · ${illumination}% illuminated`;

  return (
    <span role="img" aria-label={label} title={label} style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 6 }}>
      <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8.5" fill="#1b2433" stroke="#97a6b3" strokeWidth="0.8" />
        <path d={moonLitPath(fraction, 10, 10, 8.5)} fill="#f5edcf" />
      </svg>
    </span>
  );
}
