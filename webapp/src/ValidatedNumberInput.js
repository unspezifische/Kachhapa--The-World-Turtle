import React, { useEffect, useRef, useState } from 'react';
import { TextField } from '@mui/material';

// Keep the user's text while editing. Empty and intermediate values are valid
// drafts; only blur or Enter commits a number to the application state.
export default function ValidatedNumberInput({ value, onCommit, min, max, ...inputProps }) {
  const [text, setText] = useState(String(value ?? ''));
  const focused = useRef(false);
  const skipNextBlur = useRef(false);
  const latestValue = useRef(value);
  latestValue.current = value;

  useEffect(() => {
    if (!focused.current) setText(String(value ?? ''));
  }, [value]);

  const finish = () => {
    focused.current = false;
    if (skipNextBlur.current) {
      skipNextBlur.current = false;
      setText(String(latestValue.current ?? ''));
      return;
    }
    const raw = text.trim();
    const parsed = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(parsed)) {
      setText(String(latestValue.current ?? ''));
      return;
    }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setText(String(next));
    if (next !== latestValue.current) onCommit(next);
  };

  return <input {...inputProps} type="number" min={min} max={max} value={text}
    onFocus={() => { focused.current = true; setText(String(latestValue.current ?? '')); }}
    onChange={event => setText(event.target.value)}
    onBlur={finish}
    onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        skipNextBlur.current = true;
        setText(String(latestValue.current ?? ''));
        event.currentTarget.blur();
      }
    }} />;
}

export function ValidatedNumberField({ value, onCommit, min, max, inputProps = {}, ...fieldProps }) {
  const [text, setText] = useState(String(value ?? ''));
  const focused = useRef(false);
  const latestValue = useRef(value);
  latestValue.current = value;

  useEffect(() => {
    if (!focused.current) setText(String(value ?? ''));
  }, [value]);

  const commit = () => {
    focused.current = false;
    const raw = text.trim();
    const parsed = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(parsed)) {
      setText(String(latestValue.current ?? ''));
      return;
    }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setText(String(next));
    if (next !== latestValue.current) onCommit(next);
  };

  return <TextField {...fieldProps} type="number" value={text}
    inputProps={{ ...inputProps, min, max }}
    onFocus={() => { focused.current = true; setText(String(latestValue.current ?? '')); }}
    onChange={event => setText(event.target.value)}
    onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
