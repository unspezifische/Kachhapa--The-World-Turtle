import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import { DMSoundPlayerBar, DMSoundPlayerProvider, DMSoundPlayerWorkspace } from './DMSoundPlayer';

const mock = new MockAdapter(axios);

describe('DM sound player', () => {
  beforeEach(() => {
    mock.reset();
    window.localStorage.removeItem('kachhapa-sound-player-position');
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    mock.onGet('/api/sounds').reply(200, {
      sounds: [
        { id: 1, name: 'Storm Coast', category: 'environment', url: '/media/sounds/storm.mp3', uploadedBy: 'gm' },
        { id: 2, name: 'Fireball', category: 'sfx', url: '/media/sounds/fireball.mp3', uploadedBy: 'gm' },
      ],
    });
    mock.onGet('/api/sound-playlists').reply(200, {
      playlists: [
        { id: 10, name: 'Combat', shuffle: true, tracks: [{ id: 1, name: 'Storm Coast', category: 'environment', url: '/media/sounds/storm.mp3' }] },
      ],
    });
    mock.onGet('/api/sound-quick-effects').reply(200, {
      slots: Array.from({ length: 5 }, (_unused, index) => ({ slot: index + 1, sound: null })),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('keeps background and sound effects on independent playback decks', async () => {
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findAllByText('Storm Coast');
    fireEvent.click(container.querySelector('.sound-library-row .sound-play-button'));
    await waitFor(() => expect(screen.getAllByText('Storm Coast')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: /Fire/ }));
    await waitFor(() => expect(screen.getAllByText('Fireball')).toHaveLength(2));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  test('starts a shuffled playlist and exposes playlist assignment', async () => {
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findAllByText('Combat');
    fireEvent.click(container.querySelector('.sound-playlist-card > button:not(.sound-icon-danger)'));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(screen.getByRole('combobox', { name: 'Playlist for Storm Coast' })).toBeInTheDocument();
    expect(screen.getByText('Shuffle')).toBeInTheDocument();
  });

  test('shows queued tracks in the mini player dropdown', async () => {
    render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
        <DMSoundPlayerBar onExpand={() => {}} />
      </DMSoundPlayerProvider>
    );

    await screen.findAllByText('Storm Coast');
    fireEvent.click(screen.getByRole('button', { name: /^Queue$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open compact sound player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show queue, playlists, and Quick FX' }));
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('1 queued')).toBeInTheDocument();
    expect(screen.getAllByText('Storm Coast').length).toBeGreaterThan(2);
  });

  test('assigns a library sound effect to a Quick FX slot by dropping it', async () => {
    const assignedSlots = [
      { slot: 1, sound: { id: 2, name: 'Fireball', category: 'sfx', url: '/media/sounds/fireball.mp3' } },
      ...Array.from({ length: 4 }, (_unused, index) => ({ slot: index + 2, sound: null })),
    ];
    mock.onPut('/api/sound-quick-effects/1').reply(200, { slots: assignedSlots });

    render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findByText('Fireball');
    fireEvent.drop(screen.getByTitle('Drop a sound effect into slot 1'), {
      dataTransfer: { getData: () => '2' },
    });

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(await screen.findByTitle('Play Fireball')).toBeInTheDocument();
  });

  test('starts collapsed and opens the compact transport tray', async () => {
    render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerBar onExpand={() => {}} />
      </DMSoundPlayerProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open compact sound player' }));
    expect(screen.getByRole('button', { name: 'Show queue, playlists, and Quick FX' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show queue, playlists, and Quick FX' }));
    expect(await screen.findByText('Combat')).toBeInTheDocument();
  });

  test('drags the player icon without triggering its click and remembers the position', () => {
    const firstRender = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }} enabled={false}>
        <DMSoundPlayerBar onExpand={() => {}} />
      </DMSoundPlayerProvider>
    );
    const player = firstRender.container.querySelector('.sound-mini-player');
    const dragHandle = screen.getByTitle('Drag to move the player');
    const icon = screen.getByRole('button', { name: 'Open sound controls' });
    player.getBoundingClientRect = () => ({ left: 700, top: 40, width: 54, height: 54, right: 754, bottom: 94 });
    const dispatchPointer = (type, properties) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, { value }])));
      fireEvent(dragHandle, event);
    };

    dispatchPointer('pointerdown', { button: 0, pointerId: 1, clientX: 720, clientY: 60 });
    dispatchPointer('pointermove', { pointerId: 1, clientX: 420, clientY: 160 });
    dispatchPointer('pointerup', { pointerId: 1, clientX: 420, clientY: 160 });
    fireEvent.click(icon);

    expect(player).toHaveStyle({ left: '400px', top: '140px' });
    expect(screen.queryByRole('button', { name: 'Show queue, playlists, and Quick FX' })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('kachhapa-sound-player-position'))).toEqual({ x: 400, y: 140 });
    firstRender.unmount();
    const secondRender = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }} enabled={false}>
        <DMSoundPlayerBar onExpand={() => {}} />
      </DMSoundPlayerProvider>
    );
    expect(secondRender.container.querySelector('.sound-mini-player')).toHaveStyle({ left: '400px', top: '140px' });
  });
});
