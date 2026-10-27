import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Timeline from './Timeline';

const mock = new MockAdapter(axios);
const headers = { Authorization: 'Bearer test', campaignID: 5 };
const timeline = {
  calendar: {
    id: 9, name: 'Sword Coast Calendar',
    months: Array.from({ length: 12 }, (_, index) => ({ name: `Month ${index + 1}`, length: 30 })),
    seasons: [
      { name: 'Winter', months: [0, 1, 2], end_month_index: 2 },
      { name: 'Spring', months: [3, 4, 5], end_month_index: 5 },
      { name: 'Summer', months: [6, 7, 8], end_month_index: 8 },
      { name: 'Autumn', months: [9, 10, 11], end_month_index: 11 },
    ], holidays: [],
  },
  events: [{ id: 4, name: 'The Long Peace', description: 'A fragile accord.', date_label: 'Summer, Year 1491', year: 1491, season: 'Summer', month_index: null, day: null, precision: 'season', is_player_visible: true, npc_ids: [7], characters: [{ id: 7, name: 'Mira', label: 'Age 31' }] }],
  npcs: [{ id: 7, name: 'Mira', disabled: false, birth_year: 1460 }], can_edit: true,
};

const draw = (props = {}) => render(<MemoryRouter><Timeline headers={headers} campaignID={5} username="dm" accountType="DM" {...props} /></MemoryRouter>);

describe('Campaign Timeline', () => {
  beforeEach(() => {
    mock.reset(); localStorage.clear(); mock.onGet('/api/calendar/5/timeline').reply(200, timeline);
    URL.createObjectURL = jest.fn(() => 'blob:timeline-export'); URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); });

  test('defaults to vertical and remembers the horizontal view per user and campaign', async () => {
    const { unmount } = draw();
    expect(await screen.findByRole('region', { name: 'Vertical historical timeline' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Horizontal/i }));
    expect(screen.getByRole('region', { name: 'Horizontal historical timeline' })).toBeInTheDocument();
    expect(localStorage.getItem('kachhapa-timeline-view:dm:5')).toBe('horizontal');
    expect(screen.getByText('The Long Peace')).toBeInTheDocument();
    unmount(); draw();
    expect(await screen.findByRole('region', { name: 'Horizontal historical timeline' })).toBeInTheDocument();
  });

  test('lets the DM create a partial event and attach an NPC', async () => {
    mock.onPost('/api/calendar/5/events').reply(201, { id: 5 });
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Event' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Treaty Signed' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1492' } });
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: 'Autumn' } });
    fireEvent.click(screen.getByLabelText(/Mira/));
    fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ name: 'Treaty Signed', year: 1492, season: 'Autumn', month_index: null, day: null, npc_ids: [7], is_player_visible: false });
  });

  test('lets the DM record a year-only event range', async () => {
    mock.onPost('/api/calendar/5/events').reply(201, { id: 6 });
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Event' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Border War' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1474' } });
    fireEvent.click(screen.getByLabelText('This event spans a date range'));
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('End year'), { target: { value: '1475' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
      name: 'The Border War', year: 1474, season: '', end_year: 1475,
      end_season: null, end_month_index: null, end_day: null,
    });
  });

  test('renders player history read-only', async () => {
    draw({ accountType: 'Player', username: 'player' });
    expect(await screen.findByText('The Long Peace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.getByText('Age 31')).toBeInTheDocument();
  });

  test('exports Markdown, JSON, and a landscape PDF', async () => {
    mock.onGet('/api/calendar/5/timeline/export').reply(200, new Blob(['export']));
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(mock.history.get.filter(request => request.url.endsWith('/timeline/export'))).toHaveLength(1));
    expect(mock.history.get.at(-1).params).toEqual({ format: 'markdown' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    await waitFor(() => expect(mock.history.get.filter(request => request.url.endsWith('/timeline/export'))).toHaveLength(2));
    expect(mock.history.get.at(-1).params).toEqual({ format: 'json' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Landscape'));
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(mock.history.get.filter(request => request.url.endsWith('/timeline/export'))).toHaveLength(3));
    expect(mock.history.get.at(-1).params).toEqual({ format: 'pdf', orientation: 'landscape' });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(3);
  });

  test('previews and commits a DM-only JSON import', async () => {
    const preview = { source_format: 'json', summary: { detected: 2, ready: 1, duplicates: 1, invalid: 0, warnings: 0 }, events: [{ index: 1, name: 'Imported Event', date_label: '1474–1475 DR', warnings: [] }], duplicates: [{ index: 2, name: 'Existing Event', date_label: 'Summer, Year 1490' }], invalid: [], warnings: [] };
    mock.onPost('/api/calendar/5/timeline/import').reply(config => config.data.get('commit') === 'true' ? [201, { ...preview, imported: 1 }] : [200, preview]);
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    const file = new File(['{"events":[]}'], 'timeline.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Timeline file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview Import' }));
    expect(await screen.findByRole('region', { name: 'Timeline import preview' })).toBeInTheDocument();
    expect(screen.getByText('Imported Event')).toBeInTheDocument();
    expect(screen.getByText(/duplicate event will be skipped/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 Event' }));
    expect(await screen.findByText(/1 event imported/i)).toBeInTheDocument();
    expect(mock.history.post.filter(request => request.url.endsWith('/timeline/import'))).toHaveLength(2);
  });
});
