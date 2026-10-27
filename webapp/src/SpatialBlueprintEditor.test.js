import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import SpatialBlueprintEditor from './SpatialBlueprintEditor';

jest.mock('axios');
jest.mock('./BlueprintLevels', () => props => <div>
  <span>focus:{props.initialSelection?.element_id || 'none'}</span>
  <button onClick={() => props.onChange({ ...props.building, name: 'Revised Library' })}>Change plan</button>
  <button onClick={props.onEditorClose}>Done editing</button>
</div>);

test('saves the latest independent blueprint before closing', async () => {
  axios.patch.mockResolvedValue({ data: {} });
  const close = jest.fn();
  render(<SpatialBlueprintEditor campaignId="7" headers={{ Authorization: 'test' }}
    space={{ id: 'library', name: 'Library', independent_blueprint: { id: 'plan', name: 'Library', levels: [] } }}
    focusReference={{ level_id: 'ground', element_id: 'arch' }} onClose={close} />);

  expect(screen.getByText('focus:arch')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change plan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/7/spatial-spaces/library',
    { independent_blueprint: expect.objectContaining({ name: 'Revised Library' }) },
    { headers: { Authorization: 'test' } },
  ));
  expect(close).toHaveBeenCalled();
});

test('keeps the editor open when the final save fails', async () => {
  axios.patch.mockRejectedValue({ response: { data: { message: 'Blueprint too large' } } });
  const close = jest.fn();
  render(<SpatialBlueprintEditor campaignId="7" headers={{}}
    space={{ id: 'library', name: 'Library', independent_blueprint: { id: 'plan', levels: [] } }}
    onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Blueprint too large');
  expect(close).not.toHaveBeenCalled();
});
