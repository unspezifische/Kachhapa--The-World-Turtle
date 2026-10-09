import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReferencePlacementPanel from './ReferencePlacementPanel';
import { prepareReferencePreview } from './referencePlacement';
jest.mock('./referencePlacement', () => ({ ...jest.requireActual('./referencePlacement'), prepareReferencePreview: jest.fn() }));
const layer = { id: 'saved', name: 'Waterdeep', width_feet: 200, height_feet: 100, origin_x: 10, origin_y: 20, opacity: .7, pixel_width: 2000, pixel_height: 1000 };
function Harness({ apply }) {
  const [draft, setDraft] = useState(null);
  return <ReferencePlacementPanel layers={[layer]} selectedId="saved" select={() => {}} draft={draft} setDraft={setDraft}
    cameraRef={{ current: { target: [2, 0, 3], radius: 10 } }} apply={apply} remove={() => {}} fit={() => {}} />;
}
test('existing placement opacity can be changed without opening Edit placement', () => {
  const apply = jest.fn();
  render(<Harness apply={apply} />);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '0.42' } });
  expect(apply).toHaveBeenCalledWith({ ...layer, opacity: 0.42 });
  expect(screen.getByText('Edit placement')).toBeInTheDocument();
});
test('existing placement is staged, proportional, cancellable, and only saved on Apply', async () => {
  const apply = jest.fn().mockResolvedValue(undefined);
  render(<Harness apply={apply} />);
  fireEvent.click(screen.getByText('Edit placement'));
  fireEvent.change(screen.getByLabelText('Width (ft)'), { target: { value: '400' } });
  expect(screen.getByLabelText('Height (ft)')).toHaveValue(200);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Edit placement'));
  expect(screen.getByLabelText('Width (ft)')).toHaveValue(200);
  fireEvent.click(screen.getByLabelText('Lock proportions'));
  fireEvent.change(screen.getByLabelText('Width (ft)'), { target: { value: '450' } });
  expect(screen.getByLabelText('Height (ft)')).toHaveValue(100);
  fireEvent.click(screen.getByText('Apply changes'));
  await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({ width_feet: 450, height_feet: 100 }), null));
  await screen.findByText('Edit placement');
  expect(screen.queryByLabelText('Width (ft)')).not.toBeInTheDocument();
});
test('one upload action previews at camera before the original file is submitted', async () => {
  URL.revokeObjectURL = jest.fn();
  prepareReferencePreview.mockResolvedValue({ url: 'blob:preview', width: 600, height: 1200 });
  const apply = jest.fn().mockRejectedValue(new Error('Offline'));
  render(<Harness apply={apply} />);
  const file = new File(['image'], 'Alley.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Reference image file'), { target: { files: [file] } });
  await screen.findByText('Apply changes');
  expect(screen.getByLabelText('Center X (ft)')).toHaveValue(100);
  expect(screen.getByLabelText('Center Y (ft)')).toHaveValue(150);
  expect(screen.getByLabelText('Height (ft)').value / screen.getByLabelText('Width (ft)').value).toBe(2);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Apply changes'));
  await screen.findByText('Offline');
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alley' }), file);
  expect(screen.getByLabelText('Name')).toHaveValue('Alley');
  fireEvent.click(screen.getByText('Cancel'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
