import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import AccountProfile from './AccountProfile';

jest.mock('axios');
jest.mock('./CreateCharacterModal', () => ({ show }) => show ? <div>Create character dialog</div> : null);

test('a player membership without a character opens character creation', async () => {
  const campaign = { id: 5, name: 'Test', system: 'D&D', dm_id: 1, owner_id: 1 };
  axios.get.mockImplementation((url) => {
    if (url === '/api/campaigns') return Promise.resolve({ data: [campaign] });
    if (url === '/api/characters') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(
    <MemoryRouter>
      <AccountProfile
        headers={{ userID: 3 }}
        setAccountType={jest.fn()}
        setSelectedCampaign={jest.fn()}
        setCharacterName={jest.fn()}
      />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Open campaign Test' }));

  expect(await screen.findByText('Create character dialog')).toBeInTheDocument();
});
