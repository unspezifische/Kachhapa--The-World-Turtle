import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import DMTools from './DMTools'; // Adjust the import path as necessary

// Create a mock adapter for axios
const mock = new MockAdapter(axios);
jest.mock('./DMSoundPlayer', () => ({ DMSoundPlayerWorkspace: () => <div>Music workspace</div> }));

describe('DMTools Component', () => {
  const headers = { Authorization: 'Bearer token' };

  beforeEach(() => {
    // Reset the mock adapter before each test
    mock.reset();
  });

  test('groups tools by preparation and live-session use', () => {
    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    expect(screen.getByText('Prepare')).toBeInTheDocument();
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter Combat' })).toBeInTheDocument();
    expect(screen.queryByText('Roll / Randomize')).not.toBeInTheDocument();
  });

  test('opens Session Management directly without a redundant Home page', () => {
    render(<BrowserRouter><DMTools headers={headers} /></BrowserRouter>);

    expect(screen.queryByRole('button', { name: 'Home', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Session Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Session Management', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('explains rail tools on hover and focus without starting combat', async () => {
    const socket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
    render(<BrowserRouter><DMTools headers={headers} socket={socket} /></BrowserRouter>);
    const combat = screen.getByRole('button', { name: 'Enter Combat', exact: true });

    fireEvent.mouseOver(combat);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Prompt players to roll initiative and begin turn tracking.');
    expect(socket.emit).not.toHaveBeenCalledWith('Roll for initiative!');
    fireEvent.mouseLeave(combat);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    act(() => combat.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Prompt players to roll initiative and begin turn tracking.');
    expect(socket.emit).not.toHaveBeenCalledWith('Roll for initiative!');

    fireEvent.click(combat);
    expect(socket.emit).not.toHaveBeenCalledWith('Roll for initiative!');
  });

  test('consumes an explicit music request so later visits keep Session Management as default', async () => {
    const handled=jest.fn();
    const view=render(<BrowserRouter><DMTools headers={headers} soundPlayerOpenRequest={1} onSoundWorkspaceRequestHandled={handled} /></BrowserRouter>);
    await screen.findByText('Music workspace');
    expect(handled).toHaveBeenCalledWith(0);
    view.unmount();
    render(<BrowserRouter><DMTools headers={headers} soundPlayerOpenRequest={0} /></BrowserRouter>);
    expect(screen.getByRole('heading',{name:'Session Management'})).toBeInTheDocument();
  });

  test('NPC and loot workspaces show one create button each', async () => {
    mock.onGet('/api/npcs').reply(200, []);
    mock.onGet('/api/lootboxes').reply(200, { lootBoxes: [] });

    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'NPC Library' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Create NPC' })).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Create NPC' }).closest('.dmtools-workspace-body')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Loot Boxes' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Create Loot Box' })).toHaveLength(1));
  });

  test('filters, sorts, and configures NPC Library columns', async () => {
    mock.onGet('/api/npcs').reply(200, [
      { id: 1, name: 'Veteran Guard', creature_type: 'Humanoid', challenge: '3', ac: '17', hp: '58', strength: 16 },
      { id: 2, name: 'Apprentice Mage', creature_type: 'Humanoid', challenge: '1/4', ac: '12', hp: '9', strength: 8 },
    ]);
    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'NPC Library' }));
    await screen.findByText('Veteran Guard');
    fireEvent.click(screen.getByRole('button', { name: 'Sort NPCs by CR' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Apprentice Mage');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search NPC library' }), { target: { value: 'veteran' } });
    expect(screen.getByText('Veteran Guard')).toBeInTheDocument();
    expect(screen.queryByText('Apprentice Mage')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Columns/));
    fireEvent.click(screen.getByLabelText('STR'));
    expect(screen.getByRole('button', { name: 'Sort NPCs by STR' })).toBeInTheDocument();
  });

  test('fetches and displays loot boxes', async () => {
    // Mock the GET request for loot boxes
    mock.onGet('/api/lootboxes').reply(200, {
      lootBoxes: [{ id: 1, name: 'Loot Box 1', items: [] }]
    });

    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Loot Boxes', exact: true }));

    // Wait for the loot boxes to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText('Loot Box 1')).toBeInTheDocument();
    });
  });

  test('creates a new loot box', async () => {
    // Mock the GET request for items
    mock.onGet('/api/items').reply(200, {
      items: [{ id: 1, name: 'Item 1' }]
    });

    // Mock the POST request for creating a loot box
    mock.onPost('/api/lootboxes').reply(201, {
      message: 'Loot box created successfully'
    });

    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Loot Boxes', exact: true }));

    // Open the create loot box modal
    fireEvent.click(screen.getAllByText('Create Loot Box')[0]);

    // Wait for the items to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    // Fill in the loot box name
    fireEvent.change(screen.getByPlaceholderText('Loot Box Name'), {
      target: { value: 'New Loot Box' }
    });

    // Add an item to the loot box
    fireEvent.click(screen.getByText('Item 1'));

    // Save the loot box
    fireEvent.click(screen.getByText('Save'));

    // Wait for the POST request to be made and the modal to close
    await waitFor(() => {
      expect(mock.history.post.length).toBe(1);
      expect(screen.queryByPlaceholderText('Loot Box Name')).not.toBeInTheDocument();
    });
  });

  test('updates an existing loot box', async () => {
    // Mock the GET request for loot boxes
    mock.onGet('/api/lootboxes').reply(200, {
      lootBoxes: [{ id: 1, name: 'Loot Box 1', items: [] }]
    });

    // Mock the PUT request for updating a loot box
    mock.onPut('/api/lootboxes/1').reply(200, {
      message: 'Loot box updated successfully'
    });

    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Loot Boxes', exact: true }));

    // Wait for the loot boxes to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText('Loot Box 1')).toBeInTheDocument();
    });

    // Open the view loot box modal
    fireEvent.click(screen.getByText('Examine'));

    // Switch from the read-only preview to the editor.
    fireEvent.click((await screen.findAllByText('Edit')).at(-1));

    // Wait for the modal to open
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Loot Box Name')).toHaveValue('Loot Box 1');
    });

    // Update the loot box name
    fireEvent.change(screen.getByPlaceholderText('Loot Box Name'), {
      target: { value: 'Updated Loot Box' }
    });

    // Save the loot box
    fireEvent.click(screen.getByText('Save'));

    // Wait for the PUT request to be made and the modal to close
    await waitFor(() => {
      expect(mock.history.put.length).toBe(1);
      expect(screen.queryByPlaceholderText('Loot Box Name')).not.toBeInTheDocument();
    });
  });

  test('deletes a loot box', async () => {
    // Mock the GET request for loot boxes
    mock.onGet('/api/lootboxes').reply(200, {
      lootBoxes: [{ id: 1, name: 'Loot Box 1', items: [] }]
    });

    // Mock the DELETE request for deleting a loot box
    mock.onDelete('/api/lootboxes/1').reply(200, {
      message: 'Loot box deleted successfully'
    });

    render(
      <BrowserRouter>
        <DMTools headers={headers} />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Loot Boxes', exact: true }));

    // Wait for the loot boxes to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText('Loot Box 1')).toBeInTheDocument();
    });

    // Open the view loot box modal
    fireEvent.click(screen.getByText('Examine'));

    // Wait for the modal to open
    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    // Delete the loot box
    fireEvent.click(screen.getByText('Delete'));

    // Wait for the DELETE request to be made and the modal to close
    await waitFor(() => {
      expect(mock.history.delete.length).toBe(1);
      expect(screen.queryByText('Loot Box 1')).not.toBeInTheDocument();
    });
  });
});
