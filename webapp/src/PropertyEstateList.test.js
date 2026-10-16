import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PropertyEstateList from './PropertyEstateList';

const property = { id: 'estate', name: 'Kolat Towers', structure_ids: ['tower'] };
const building = { id: 'tower', name: 'Main Tower' };
const setup = () => {
  const callbacks = { onSelect: jest.fn(), onSelectBuilding: jest.fn(), onCreate: jest.fn(), onRename: jest.fn(), onDelete: jest.fn(), onAddStructure: jest.fn() };
  render(<PropertyEstateList properties={[property]} buildings={[building]} selectedId="estate" {...callbacks} />);
  return callbacks;
};

test('property and its collapsed building list have separate, explicit actions', () => {
  const callbacks = setup();
  expect(screen.queryByLabelText('Property name')).toBeNull();
  const summary = screen.getByText('Buildings on this property');
  expect(summary.parentElement.open).toBe(false);
  fireEvent.click(summary);
  fireEvent.click(screen.getByRole('button', { name: /Building Main Tower Select building/ }));
  expect(callbacks.onSelectBuilding).toHaveBeenCalledWith(building);
});

test('creation asks for a name and renaming is in property Details', () => {
  const callbacks = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Create Property / Estate' }));
  fireEvent.change(screen.getByLabelText('Property name'), { target: { value: 'New Estate' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Property', exact: true }));
  expect(callbacks.onCreate).toHaveBeenCalledWith('New Estate');
});

test('property Details explains deletion and requires the explicit delete action', async () => {
  const callbacks = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Details for Kolat Towers' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Property name'), { target: { value: 'Estate' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save Details' }));
  expect(callbacks.onRename).toHaveBeenCalledWith('estate', 'Estate');
  fireEvent.click(await screen.findByRole('button', { name: 'Details for Kolat Towers' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete Property…' }));
  expect(screen.getByText(/buildings will be kept as separate properties/)).toBeTruthy();
  expect(callbacks.onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Property', exact: true }));
  expect(callbacks.onDelete).toHaveBeenCalledWith('estate');
});
