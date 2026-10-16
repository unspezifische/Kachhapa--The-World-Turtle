import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import UserProfile from './UserProfile';

jest.mock('axios');

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
  axios.get.mockImplementation(url=>Promise.resolve({data:url==='/api/appearance'?require('../../Flask/theme_presets.json'):{ username: 'tester', real_name: 'Taylor', bio: 'I enjoy mysteries.', has_profile_photo: false }}));
});

function renderProfile() { render(<MemoryRouter><UserProfile headers={{ Authorization: 'Bearer token' }} /></MemoryRouter>); }

test('profile details are editable on the separate page', async () => {
  renderProfile();
  fireEvent.change(await screen.findByLabelText('Real name'), { target: { value: 'Taylor Rose' } });
  axios.patch.mockResolvedValue({ data: { username: 'tester', real_name: 'Taylor Rose', bio: 'I enjoy mysteries.', has_profile_photo: false } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/profile', { real_name: 'Taylor Rose', bio: 'I enjoy mysteries.' }, expect.anything()));
});

test('profile picture picker accepts animated GIF files', async () => {
  renderProfile();
  const picker = await screen.findByLabelText('Upload profile picture');
  expect(picker).toHaveAttribute('accept', expect.stringContaining('image/gif'));
  expect(screen.getByText(/Animated GIFs keep their motion/)).toBeInTheDocument();
});

test('choosing a profile image opens the crop and position step before upload', async () => {
  renderProfile();
  const picker = await screen.findByLabelText('Upload profile picture');
  fireEvent.change(picker, { target: { files: [new File(['picture'], 'portrait.png', { type: 'image/png' })] } });
  expect(screen.getByText('Crop & position your profile picture')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test('password change stays in account settings and validates confirmation', async () => {
  renderProfile();
  await screen.findByLabelText('Real name');
  fireEvent.click(screen.getByText('Account settings'));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a much safer new password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different safe password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByText('New passwords do not match.')).toBeInTheDocument();
  expect(axios.patch).not.toHaveBeenCalled();
});

test('valid password change calls the existing endpoint', async () => {
  renderProfile();
  await screen.findByLabelText('Real name');
  fireEvent.click(screen.getByText('Account settings'));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a much safer new password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a much safer new password' } });
  axios.patch.mockResolvedValue({ data: { message: 'Password updated successfully.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/profile/password', { current_password: 'old password', new_password: 'a much safer new password' }, expect.anything()));
});
