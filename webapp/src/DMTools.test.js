import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import DMTools from './DMTools'; // Adjust the import path as necessary

// Create a mock adapter for axios
const mock = new MockAdapter(axios);

describe('DMTools Component', () => {
  const headers = { Authorization: 'Bearer token' };

  beforeEach(() => {
    // Reset the mock adapter before each test
    mock.reset();
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

    // Open the create loot box modal
    fireEvent.click(screen.getByText('Create Loot Box'));

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
      expect(screen.queryByText('Create Loot Box')).not.toBeInTheDocument();
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

    // Wait for the loot boxes to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText('Loot Box 1')).toBeInTheDocument();
    });

    // Open the view loot box modal
    fireEvent.click(screen.getByText('Examine'));

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
      expect(screen.queryByText('Loot Box 1')).not.toBeInTheDocument();
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