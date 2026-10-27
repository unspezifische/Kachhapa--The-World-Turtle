import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import { DMSoundPlayerBar, DMSoundPlayerProvider, DMSoundPlayerWorkspace } from './DMSoundPlayer';

const mock = new MockAdapter(axios);
let soundUploadJobs;

describe('DM sound player', () => {
  beforeEach(() => {
    mock.reset();
    soundUploadJobs = [];
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
      slots: Array.from({ length: 6 }, (_unused, index) => ({ slot: index + 1, sound: null })),
    });
    mock.onGet('/api/sound-upload-jobs').reply((config) => {
      const requested = config.params?.ids?.split(',').filter(Boolean);
      const jobs = requested
        ? soundUploadJobs.filter((job) => requested.includes(job.id))
        : soundUploadJobs.filter((job) => job.status !== 'complete');
      return [200, { jobs }];
    });
    mock.onPost('/api/sound-upload-checks').reply(200, { checks: [] });
  });

  afterEach(() => jest.restoreAllMocks());

  test('keeps background and sound effects on independent playback decks', async () => {
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findAllByText('Storm Coast');
    const stormRow = [...container.querySelectorAll('.sound-library-row')]
      .find((row) => row.textContent.includes('Storm Coast'));
    fireEvent.click(stormRow.querySelector('.sound-play-button'));
    await waitFor(() => expect(screen.getAllByText('Storm Coast')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Fire/ }));
    await waitFor(() => expect(screen.getAllByText('Fireball')).toHaveLength(2));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  test('sorts the sound library by title, date added, and track length', async () => {
    mock.onGet('/api/sounds').reply(200, {
      sounds: [
        { id: 1, name: 'Middle', category: 'music', url: '/middle.mp3', createdAt: '2026-01-02T00:00:00Z', durationSeconds: 180 },
        { id: 2, name: 'Alpha', category: 'music', url: '/alpha.mp3', createdAt: '2026-01-03T00:00:00Z', durationSeconds: 240 },
        { id: 3, name: 'Zulu', category: 'music', url: '/zulu.mp3', createdAt: '2026-01-01T00:00:00Z', durationSeconds: 60 },
      ],
    });
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findByText('Alpha');
    const rowNames = () => [...container.querySelectorAll('.sound-library-copy strong')].map((node) => node.textContent);
    expect(rowNames()).toEqual(['Alpha', 'Middle', 'Zulu']);

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort sound library' }), { target: { value: 'date-desc' } });
    expect(rowNames()).toEqual(['Alpha', 'Middle', 'Zulu']);

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort sound library' }), { target: { value: 'length-asc' } });
    expect(rowNames()).toEqual(['Zulu', 'Middle', 'Alpha']);
    expect(screen.getByText(/1:00/)).toBeInTheDocument();
  });

  test('filters the sound library by playlist or unassigned tracks', async () => {
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findAllByText('Storm Coast');
    const libraryNames = () => [...container.querySelectorAll('.sound-library-copy strong')]
      .map((node) => node.textContent);
    fireEvent.click(screen.getByTitle('View Combat'));
    expect(libraryNames()).toEqual(['Storm Coast']);

    fireEvent.click(screen.getByRole('button', { name: /Not in a playlist/i }));
    expect(libraryNames()).toEqual(['Fireball']);

    fireEvent.click(screen.getByTitle('View Combat'));
    expect(libraryNames()).toEqual(['Storm Coast']);
  });

  test('starts a shuffled playlist and exposes playlist assignment', async () => {
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findAllByText('Combat');
    fireEvent.click(screen.getByRole('button', { name: 'Play Combat' }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(screen.getByRole('combobox', { name: 'Playlist for Storm Coast' })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('View Combat'));
    expect(screen.getByText('Shuffle playback')).toBeInTheDocument();
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
    expect(screen.getAllByText('Storm Coast').length).toBeGreaterThan(1);
  });

  test('assigns a library sound effect to a Quick FX slot by dropping it', async () => {
    const assignedSlots = [
      { slot: 1, sound: { id: 2, name: 'Fireball', category: 'sfx', url: '/media/sounds/fireball.mp3' } },
      ...Array.from({ length: 5 }, (_unused, index) => ({ slot: index + 2, sound: null })),
    ];
    mock.onPut('/api/sound-quick-effects/1').reply(200, { slots: assignedSlots });

    render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findByText('Fireball');
    fireEvent.drop(screen.getByTitle('Choose or drop a sound effect into slot 1'), {
      dataTransfer: { getData: () => '2' },
    });

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(await screen.findByTitle('Play Fireball')).toBeInTheDocument();
  });

  test('chooses a track by clicking an empty Quick FX slot', async () => {
    const assignedSlots = [
      { slot: 1, sound: { id: 2, name: 'Fireball', category: 'sfx', url: '/media/sounds/fireball.mp3' } },
      ...Array.from({ length: 5 }, (_unused, index) => ({ slot: index + 2, sound: null })),
    ];
    mock.onPut('/api/sound-quick-effects/1').reply(200, { slots: assignedSlots });

    render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findByText('Fireball');
    fireEvent.click(screen.getByTitle('Choose or drop a sound effect into slot 1'));
    const chooser = screen.getByRole('dialog', { name: 'Choose a sound effect for Quick FX slot 1' });
    fireEvent.click(chooser.querySelector('button:not([aria-label])'));

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ soundId: 2 });
    expect(await screen.findByTitle('Play Fireball')).toBeInTheDocument();
  });

  test('provides a plain-text drag payload for Safari-compatible Quick FX drops', async () => {
    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );

    await screen.findByText('Fireball');
    const row = [...container.querySelectorAll('.sound-library-row')].find((item) => item.textContent.includes('Fireball'));
    const setData = jest.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith('application/x-kachhapa-sound-id', '2');
    expect(setData).toHaveBeenCalledWith('text/plain', '2');
  });

  test('shows per-file progress for a file-browser upload', async () => {
    let finishUpload;
    mock.onPost('/api/sounds').reply((config) => new Promise((resolve) => {
      config.onUploadProgress({ loaded: 25, total: 100 });
      finishUpload = () => {
        soundUploadJobs = [{
          id: 'rain-job', status: 'complete', originalFilename: 'rain.mp3', name: 'Rainfall', category: 'music',
          sound: { id: 9, name: 'Rainfall', category: 'music', url: '/media/sounds/rain.mp3', uploadedBy: 'gm' },
        }];
        resolve([202, { job: { id: 'rain-job', status: 'queued', originalFilename: 'rain.mp3' } }]);
      };
    }));

    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );
    const file = new File(['audio bytes'], 'rain.mp3', { type: 'audio/mpeg' });
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));
    fireEvent.change(container.querySelector('.sound-upload-drawer input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue for import' }));

    expect(await screen.findByRole('progressbar', { name: 'Uploading rain.mp3: 25%' })).toBeInTheDocument();
    await act(async () => finishUpload());
    expect(await screen.findByRole('img', { name: 'Uploaded rain.mp3' })).toBeInTheDocument();
  });

  test('keeps an active upload and its progress visible after leaving the Music Player page', async () => {
    let finishUpload;
    mock.onPost('/api/sounds').reply((config) => new Promise((resolve) => {
      config.onUploadProgress({ loaded: 40, total: 100 });
      finishUpload = () => {
        soundUploadJobs = [{
          id: 'long-job', status: 'complete', originalFilename: 'long.mp3', name: 'Long ambience', category: 'music',
          sound: { id: 11, name: 'Long ambience', category: 'music', url: '/media/sounds/long.mp3', uploadedBy: 'gm' },
        }];
        resolve([202, { job: { id: 'long-job', status: 'queued', originalFilename: 'long.mp3' } }]);
      };
    }));

    function NavigationHarness() {
      const [showPlayer, setShowPlayer] = React.useState(true);
      return (
        <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
          <button type="button" onClick={() => setShowPlayer(false)}>Leave Music Player</button>
          {showPlayer && <DMSoundPlayerWorkspace />}
        </DMSoundPlayerProvider>
      );
    }

    const { container } = render(<NavigationHarness />);
    const file = new File(['audio bytes'], 'long.mp3', { type: 'audio/mpeg' });
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));
    fireEvent.change(container.querySelector('.sound-upload-drawer input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue for import' }));
    expect(await screen.findByRole('progressbar', { name: 'Uploading long.mp3: 40%' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leave Music Player' }));
    expect(screen.queryByText('Sound library')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uploading long.mp3: 40%' })).toBeInTheDocument();

    await act(async () => finishUpload());
    expect(await screen.findByRole('img', { name: 'Uploaded long.mp3' })).toBeInTheDocument();
  });

  test('shows the server reason on a failed drag-and-drop upload', async () => {
    mock.onPost('/api/sounds').reply(413, {
      message: 'The file is larger than the 1 GB upload limit.',
      error: { code: 'file_too_large', filename: 'battle.mp3' },
    });

    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );
    const file = new File(['audio bytes'], 'battle.mp3', { type: 'audio/mpeg' });
    fireEvent.drop(container.querySelector('.sound-workspace'), {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    const failure = await screen.findByRole('button', {
      name: 'Retry battle.mp3: The file is larger than the 1 GB upload limit.',
    });
    expect(failure).toHaveAttribute('title', 'The file is larger than the 1 GB upload limit.');
  });

  test('stages a 33-file folder with at most two simultaneous requests', async () => {
    let active = 0;
    let maximumActive = 0;
    const resolvers = [];
    mock.onPost('/api/sounds').reply(() => new Promise((resolve) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      resolvers.push(() => {
        const number = resolvers.length;
        active -= 1;
        resolve([202, { job: { id: `bulk-job-${number}`, status: 'queued' } }]);
      });
    }));

    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );
    const files = Array.from({ length: 33 }, (_unused, index) => (
      new File(['audio bytes'], `track-${index + 1}.mp3`, { type: 'audio/mpeg' })
    ));
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));
    fireEvent.change(container.querySelector('.sound-upload-drawer input[type="file"]'), { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue for import' }));

    const soundPosts = () => mock.history.post.filter((request) => request.url === '/api/sounds');
    await waitFor(() => expect(soundPosts()).toHaveLength(2));
    expect(screen.getByText('0/33 ready')).toBeInTheDocument();
    expect(maximumActive).toBe(2);

    await act(async () => resolvers.shift()());
    await waitFor(() => expect(soundPosts()).toHaveLength(3));
    expect(maximumActive).toBe(2);
  });

  test('acknowledges known tracks without uploading their bytes again', async () => {
    mock.onPost('/api/sound-upload-checks').reply((config) => {
      const files = JSON.parse(config.data).files;
      return [200, { checks: files.map((file, index) => index === 0 ? {
        clientId: file.clientId,
        status: 'library',
        sound: { id: 27, name: 'Known track', category: 'music', url: '/media/sounds/known.mp3' },
      } : { clientId: file.clientId, status: 'upload' }) }];
    });
    mock.onPost('/api/sounds').reply(202, { job: { id: 'new-job', status: 'queued' } });

    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );
    const known = new File(['known bytes'], 'known.mp3', { type: 'audio/mpeg' });
    const fresh = new File(['fresh bytes'], 'fresh.mp3', { type: 'audio/mpeg' });
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));
    fireEvent.change(container.querySelector('.sound-upload-drawer input[type="file"]'), { target: { files: [known, fresh] } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue for import' }));

    expect(await screen.findByRole('img', { name: 'Skipped duplicate known.mp3' })).toBeInTheDocument();
    expect(screen.getByText('Already in library')).toBeInTheDocument();
    await waitFor(() => expect(mock.history.post.filter((request) => request.url === '/api/sounds')).toHaveLength(1));
    expect(screen.getByText('0/2 ready · 1 skipped')).toBeInTheDocument();
  });

  test('retries a transient gateway failure with the same idempotency key', async () => {
    const keys = [];
    let attempt = 0;
    mock.onPost('/api/sounds').reply((config) => {
      keys.push(config.headers.get ? config.headers.get('Idempotency-Key') : config.headers['Idempotency-Key']);
      attempt += 1;
      if (attempt === 1) return [504, { message: 'Gateway timed out' }];
      return [202, { job: { id: 'retry-job', status: 'queued' } }];
    });

    const { container } = render(
      <DMSoundPlayerProvider headers={{ Authorization: 'Bearer test', campaignID: 1 }}>
        <DMSoundPlayerWorkspace />
      </DMSoundPlayerProvider>
    );
    const file = new File(['audio bytes'], 'retry.mp3', { type: 'audio/mpeg' });
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));
    fireEvent.change(container.querySelector('.sound-upload-drawer input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue for import' }));

    await waitFor(() => expect(mock.history.post.filter((request) => request.url === '/api/sounds')).toHaveLength(2), { timeout: 2500 });
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
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
