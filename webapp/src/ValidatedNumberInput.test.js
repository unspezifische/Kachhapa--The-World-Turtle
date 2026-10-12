import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ValidatedNumberInput, { ValidatedNumberField } from './ValidatedNumberInput';

function Harness() {
  const [value, setValue] = useState(12);
  return <ValidatedNumberInput aria-label="Distance" value={value} min={1} onCommit={setValue} />;
}

test('commits typed numbers on blur, restores blanks, and clamps only on blur', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Distance');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  expect(input).toHaveValue(null);
  fireEvent.change(input, { target: { value: '40' } });
  expect(input).toHaveValue(40);
  fireEvent.blur(input);
  expect(input).toHaveValue(40);

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(input).toHaveValue(40);

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '0' } });
  expect(input).toHaveValue(0);
  fireEvent.blur(input);
  expect(input).toHaveValue(1);
});

test('material number field accepts replacement text before committing', () => {
  function FieldHarness() {
    const [value, setValue] = useState(12);
    return <ValidatedNumberField label="Travelers" value={value} min={1} onCommit={setValue} />;
  }
  render(<FieldHarness />);
  const input = screen.getByLabelText('Travelers');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  expect(input).toHaveValue(null);
  fireEvent.change(input, { target: { value: '40' } });
  fireEvent.blur(input);
  expect(input).toHaveValue(40);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(input).toHaveValue(40);
});
