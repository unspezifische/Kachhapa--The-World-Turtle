import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import Calendar from './Calendar';

const mock = new MockAdapter(axios);
const headers = { Authorization: 'Bearer test', campaignID: 5 };

describe('Calendar empty state', () => {
  beforeEach(() => mock.reset());

  test("tells a player when the DM hasn't configured a calendar", async () => {
    mock.onGet('/api/calendar/5').reply(200, { configured: false, message: 'No calendar found for campaign 5' });

    render(<Calendar headers={headers} campaignID={5} accountType="Player" />);

    expect(await screen.findByText("The DM hasn't set up a calendar for this campaign yet.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Calendar' })).not.toBeInTheDocument();
  });

  test('lets the DM create a calendar from the empty state', async () => {
    mock.onGet('/api/calendar/5').reply(200, { configured: false, message: 'No calendar found for campaign 5' });
    mock.onGet('/api/calendar-formats').reply(200, {
      formats: [{ slug: 'gregorian', display_name: 'Gregorian Calendar' }],
    });
    mock.onPost('/api/calendar/5').reply(201, {
      id: 9,
      current_date: { year: 1, month_index: 0, day: 1 },
      months: [{ name: 'January', length: 31 }],
    });
    mock.onGet('/api/calendar/5/month-view').reply(200, {
      year: 1,
      month_index: 0,
      month: { name: 'January' },
      columns: [],
      days: [],
    });

    render(<Calendar headers={headers} campaignID={5} accountType="DM" />);

    await screen.findByText("Set up this campaign's calendar");
    fireEvent.change(screen.getByLabelText('Calendar name'), { target: { value: 'New Campaign Calendar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Calendar' }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
      name: 'New Campaign Calendar',
      format_slug: 'gregorian',
      year: 1,
      month_index: 0,
      day: 1,
    });
  });
});
