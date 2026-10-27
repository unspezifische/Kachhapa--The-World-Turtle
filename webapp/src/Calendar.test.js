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
    mock.onGet('/api/calendar/5/year-view').reply(200, {
      year: 1,
      months: [{ month_index: 0, month: { name: 'January' }, columns: [], days: [] }],
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

  test('lets the DM mark a new event visible to players', async () => {
    mock.onGet('/api/calendar/5').reply(200, {
      id: 9,
      current_date: { year: 1, month_index: 0, month_name: 'January', day: 1 },
      months: [{ name: 'January', length: 31 }],
    });
    mock.onGet('/api/calendar/5/year-view').reply(200, {
      year: 1,
      months: [{ month_index: 0, month: { name: 'January' }, columns: ['Mon'],
        days: [{ year: 1, month_index: 0, day: 1, events: [], holidays: [], moons: [] }] }],
    });
    mock.onPost('/api/calendar/5/events').reply(201, { id: 4 });

    render(<Calendar headers={headers} campaignID={5} accountType="DM" />);
    fireEvent.click(await screen.findByRole('button', { name: 'January 1, Year 1' }));
    fireEvent.change(screen.getByPlaceholderText('Event name'), { target: { value: 'Harvest fair' } });
    fireEvent.click(screen.getByLabelText('Visible to players'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ name: 'Harvest fair', is_player_visible: true });
  });

  test('renders the full year continuously from one year-view request with correctly ordered moon phases', async () => {
    mock.onGet('/api/calendar/5').reply(200, {
      id: 9,
      current_date: { year: 1487, month_index: 0, month_name: 'Hammer', day: 1 },
      months: [{ name: 'Hammer', length: 1 }, { name: 'Alturiak', length: 1 }],
    });
    mock.onGet('/api/calendar/5/year-view').reply(200, {
      year: 1487,
      months: [
        { month_index: 0, month: { name: 'Hammer' }, columns: ['Firstday'], days: [
          { year: 1487, month_index: 0, day: 1, events: [], holidays: [], moons: [
            { name: 'Selûne', phase: 'waxing-crescent' },
            { name: 'Tears', phase: 'waning-crescent' },
          ] },
        ] },
        { month_index: 1, month: { name: 'Alturiak' }, columns: ['Firstday'], days: [
          { year: 1487, month_index: 1, day: 1, events: [], holidays: [], moons: [] },
        ] },
      ],
    });

    render(<Calendar headers={headers} campaignID={5} accountType="DM" />);

    expect(await screen.findByRole('heading', { name: 'Hammer Month 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alturiak Month 2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Selûne: waxing-crescent')).toHaveTextContent('🌒');
    expect(screen.getByLabelText('Tears: waning-crescent')).toHaveTextContent('🌘');
    expect(mock.history.get.filter(request => request.url === '/api/calendar/5/year-view')).toHaveLength(1);
    expect(mock.history.get.some(request => request.url === '/api/calendar/5/month-view')).toBe(false);
    expect(screen.getByRole('link', { name: 'Timeline' })).toHaveAttribute('href', '/timeline');
  });
});
