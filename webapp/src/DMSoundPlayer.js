import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Add,
  ChevronLeft,
  ChevronRight,
  Clear,
  DeleteOutline,
  ExpandMore,
  GraphicEq,
  LibraryMusic,
  MusicNote,
  Pause,
  PlayArrow,
  QueueMusic,
  Shuffle,
  SkipNext,
  Stop,
  Upload,
  VolumeDown,
  VolumeUp,
} from '@mui/icons-material';

import './DMSoundPlayer.css';

const SoundPlayerContext = createContext(null);
const SOUND_PLAYER_POSITION_KEY = 'kachhapa-sound-player-position';
const SOUND_PLAYER_EDGE_GAP = 12;

function storedPlayerPosition() {
  try {
    const position = JSON.parse(window.localStorage.getItem(SOUND_PLAYER_POSITION_KEY));
    if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) return position;
  } catch (_error) {
    // A blocked or malformed local preference should not prevent the player from rendering.
  }
  return null;
}

function clampPlayerPosition(x, y, width, height) {
  const maximumX = Math.max(SOUND_PLAYER_EDGE_GAP, window.innerWidth - width - SOUND_PLAYER_EDGE_GAP);
  const maximumY = Math.max(SOUND_PLAYER_EDGE_GAP, window.innerHeight - height - SOUND_PLAYER_EDGE_GAP);
  return {
    x: Math.round(Math.min(maximumX, Math.max(SOUND_PLAYER_EDGE_GAP, x))),
    y: Math.round(Math.min(maximumY, Math.max(SOUND_PLAYER_EDGE_GAP, y))),
  };
}

function rememberPlayerPosition(position) {
  try {
    window.localStorage.setItem(SOUND_PLAYER_POSITION_KEY, JSON.stringify(position));
  } catch (_error) {
    // Playback and dragging should continue even when local storage is unavailable.
  }
}

function useSoundPlayer() {
  const value = useContext(SoundPlayerContext);
  if (!value) throw new Error('Sound player controls must be used inside DMSoundPlayerProvider');
  return value;
}

export function DMSoundPlayerProvider({ headers, socket, enabled = true, children }) {
  const backgroundAudio = useRef([]);
  const effectsAudio = useRef(null);
  const fadeTimer = useRef(null);
  const queueRef = useRef([]);
  const queuePlaybackRef = useRef(false);
  const playBackgroundRef = useRef(null);
  const trackHistoryRef = useRef([]);
  const [sounds, setSounds] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backgroundTrack, setBackgroundTrack] = useState(null);
  const [backgroundPlaying, setBackgroundPlaying] = useState(false);
  const [activeDeck, setActiveDeck] = useState(0);
  const [backgroundVolume, setBackgroundVolume] = useState(0.65);
  const [loopBackground, setLoopBackground] = useState(true);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(3);
  const [effectTrack, setEffectTrack] = useState(null);
  const [effectPlaying, setEffectPlaying] = useState(false);
  const [effectVolume, setEffectVolume] = useState(0.85);
  const [backgroundCurrentTime, setBackgroundCurrentTime] = useState(0);
  const [backgroundDuration, setBackgroundDuration] = useState(0);
  const [backgroundHistoryLength, setBackgroundHistoryLength] = useState(0);
  const [quickEffects, setQuickEffects] = useState(Array.from({ length: 5 }, (_unused, index) => ({ slot: index + 1, sound: null })));

  const replaceQueue = useCallback((tracks) => {
    queueRef.current = tracks;
    setQueue(tracks);
  }, []);

  const fetchSounds = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await axios.get('/api/sounds', { headers });
      setSounds(response.data.sounds || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load the shared sound library.');
    } finally {
      setLoading(false);
    }
  }, [enabled, headers]);

  const fetchPlaylists = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await axios.get('/api/sound-playlists', { headers });
      setPlaylists(response.data.playlists || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load sound playlists.');
    }
  }, [enabled, headers]);

  const fetchQuickEffects = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await axios.get('/api/sound-quick-effects', { headers });
      setQuickEffects(response.data.slots || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load Quick FX presets.');
    }
  }, [enabled, headers]);

  useEffect(() => {
    fetchSounds();
    fetchPlaylists();
    fetchQuickEffects();
  }, [fetchPlaylists, fetchQuickEffects, fetchSounds]);

  useEffect(() => {
    if (!socket || !enabled) return undefined;
    socket.on('sound_library_updated', fetchSounds);
    socket.on('sound_playlists_updated', fetchPlaylists);
    socket.on('sound_quick_effects_updated', fetchQuickEffects);
    return () => {
      socket.off('sound_library_updated', fetchSounds);
      socket.off('sound_playlists_updated', fetchPlaylists);
      socket.off('sound_quick_effects_updated', fetchQuickEffects);
    };
  }, [socket, enabled, fetchPlaylists, fetchQuickEffects, fetchSounds]);

  useEffect(() => () => {
    if (fadeTimer.current) window.clearInterval(fadeTimer.current);
    backgroundAudio.current.forEach((audio) => audio?.pause());
    effectsAudio.current?.pause();
  }, []);

  useEffect(() => {
    const activeAudio = backgroundAudio.current[activeDeck];
    if (activeAudio) {
      if (!fadeTimer.current) activeAudio.volume = backgroundVolume;
      setBackgroundCurrentTime(activeAudio.currentTime || 0);
      setBackgroundDuration(Number.isFinite(activeAudio.duration) ? activeAudio.duration : 0);
    }
  }, [activeDeck, backgroundVolume]);

  useEffect(() => {
    backgroundAudio.current.forEach((audio) => {
      if (audio) audio.loop = loopBackground && !queuePlaybackRef.current;
    });
  }, [loopBackground, queue.length]);

  useEffect(() => {
    if (effectsAudio.current) effectsAudio.current.volume = effectVolume;
  }, [effectVolume]);

  const stopBackground = useCallback(() => {
    if (fadeTimer.current) window.clearInterval(fadeTimer.current);
    fadeTimer.current = null;
    backgroundAudio.current.forEach((audio) => {
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    });
    queuePlaybackRef.current = false;
    trackHistoryRef.current = [];
    setBackgroundHistoryLength(0);
    replaceQueue([]);
    setBackgroundPlaying(false);
    setBackgroundCurrentTime(0);
    setBackgroundDuration(0);
  }, [replaceQueue]);

  const toggleBackground = useCallback(async () => {
    const audio = backgroundAudio.current[activeDeck];
    if (!audio || !backgroundTrack) return;
    if (audio.paused) {
      try {
        await audio.play();
        setBackgroundPlaying(true);
        setError('');
      } catch (_error) {
        setError('Your browser blocked playback. Select the track again to start it.');
      }
    } else {
      audio.pause();
      setBackgroundPlaying(false);
    }
  }, [activeDeck, backgroundTrack]);

  const playBackground = useCallback(async (track, options = {}) => {
    const fromQueue = Boolean(options.fromQueue);
    if (!fromQueue) {
      queuePlaybackRef.current = false;
      replaceQueue([]);
    }
    if (backgroundTrack?.id === track.id) {
      await toggleBackground();
      return;
    }
    if (backgroundTrack && !options.fromHistory) {
      trackHistoryRef.current = [...trackHistoryRef.current.slice(-24), backgroundTrack];
      setBackgroundHistoryLength(trackHistoryRef.current.length);
    }

    if (fadeTimer.current) window.clearInterval(fadeTimer.current);
    fadeTimer.current = null;
    const outgoingIndex = activeDeck;
    const incomingIndex = backgroundPlaying ? 1 - activeDeck : activeDeck;
    const outgoing = backgroundAudio.current[outgoingIndex];
    const incoming = backgroundAudio.current[incomingIndex];
    if (!incoming) return;

    incoming.src = track.url;
    incoming.currentTime = 0;
    incoming.loop = loopBackground && !queuePlaybackRef.current;
    incoming.volume = backgroundPlaying && crossfadeSeconds > 0 ? 0 : backgroundVolume;

    try {
      await incoming.play();
    } catch (_error) {
      setError('This audio format could not be played by your browser.');
      return;
    }

    setBackgroundTrack(track);
    setBackgroundCurrentTime(0);
    setBackgroundDuration(0);
    setBackgroundPlaying(true);
    setActiveDeck(incomingIndex);
    setError('');

    if (!backgroundPlaying || !outgoing || outgoing.paused || crossfadeSeconds <= 0) {
      if (outgoing && outgoing !== incoming) outgoing.pause();
      return;
    }

    const startedAt = Date.now();
    fadeTimer.current = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / (crossfadeSeconds * 1000));
      incoming.volume = backgroundVolume * progress;
      outgoing.volume = backgroundVolume * (1 - progress);
      if (progress >= 1) {
        window.clearInterval(fadeTimer.current);
        fadeTimer.current = null;
        outgoing.pause();
        outgoing.currentTime = 0;
      }
    }, 50);
  }, [activeDeck, backgroundPlaying, backgroundTrack, backgroundVolume, crossfadeSeconds, loopBackground, replaceQueue, toggleBackground]);

  useEffect(() => {
    playBackgroundRef.current = playBackground;
  }, [playBackground]);

  const playNextQueued = useCallback(async () => {
    const [next, ...remaining] = queueRef.current;
    replaceQueue(remaining);
    if (!next) {
      queuePlaybackRef.current = false;
      setBackgroundPlaying(false);
      return;
    }
    queuePlaybackRef.current = true;
    await playBackgroundRef.current?.(next, { fromQueue: true });
  }, [replaceQueue]);

  const playPreviousBackground = useCallback(async () => {
    const previous = trackHistoryRef.current.at(-1);
    if (!previous) return;
    trackHistoryRef.current = trackHistoryRef.current.slice(0, -1);
    setBackgroundHistoryLength(trackHistoryRef.current.length);
    await playBackgroundRef.current?.(previous, { fromQueue: queuePlaybackRef.current, fromHistory: true });
  }, []);

  const enqueueTrack = useCallback((track) => {
    replaceQueue([...queueRef.current, track]);
  }, [replaceQueue]);

  const removeQueuedTrack = useCallback((index) => {
    replaceQueue(queueRef.current.filter((_track, trackIndex) => trackIndex !== index));
  }, [replaceQueue]);

  const clearQueue = useCallback(() => {
    replaceQueue([]);
    queuePlaybackRef.current = false;
  }, [replaceQueue]);

  const startPlaylist = useCallback(async (playlist) => {
    let tracks = [...(playlist.tracks || [])];
    if (playlist.shuffle) {
      for (let index = tracks.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [tracks[index], tracks[swapIndex]] = [tracks[swapIndex], tracks[index]];
      }
    }
    queuePlaybackRef.current = true;
    replaceQueue(tracks);
    await playNextQueued();
  }, [playNextQueued, replaceQueue]);

  const playEffect = useCallback(async (track) => {
    const audio = effectsAudio.current;
    if (!audio) return;
    audio.src = track.url;
    audio.currentTime = 0;
    audio.volume = effectVolume;
    setEffectTrack(track);
    try {
      await audio.play();
      setEffectPlaying(true);
      setError('');
    } catch (_error) {
      setError('This sound effect could not be played by your browser.');
    }
  }, [effectVolume]);

  const stopEffect = useCallback(() => {
    const audio = effectsAudio.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setEffectPlaying(false);
  }, []);

  const uploadSound = useCallback(async ({ file, name, category }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    const response = await axios.post('/api/sounds', formData, { headers });
    setSounds((current) => [...current, response.data.sound].sort((a, b) => a.name.localeCompare(b.name)));
    return response.data.sound;
  }, [headers]);

  const configureQuickEffect = useCallback(async (slot, sound) => {
    const response = await axios.put(`/api/sound-quick-effects/${slot}`, { soundId: sound?.id ?? null }, { headers });
    setQuickEffects(response.data.slots || []);
    return response.data.slots;
  }, [headers]);

  const createPlaylist = useCallback(async (name) => {
    const response = await axios.post('/api/sound-playlists', { name, shuffle: false }, { headers });
    setPlaylists((current) => [...current, response.data.playlist].sort((a, b) => a.name.localeCompare(b.name)));
    return response.data.playlist;
  }, [headers]);

  const updatePlaylist = useCallback(async (playlistId, changes) => {
    const response = await axios.patch(`/api/sound-playlists/${playlistId}`, changes, { headers });
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? response.data.playlist : playlist));
    return response.data.playlist;
  }, [headers]);

  const deletePlaylist = useCallback(async (playlistId) => {
    await axios.delete(`/api/sound-playlists/${playlistId}`, { headers });
    setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
  }, [headers]);

  const addTrackToPlaylist = useCallback(async (playlistId, soundId) => {
    const response = await axios.post(`/api/sound-playlists/${playlistId}/tracks`, { soundId }, { headers });
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? response.data.playlist : playlist));
  }, [headers]);

  const removeTrackFromPlaylist = useCallback(async (playlistId, soundId) => {
    const response = await axios.delete(`/api/sound-playlists/${playlistId}/tracks/${soundId}`, { headers });
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? response.data.playlist : playlist));
  }, [headers]);

  const value = {
    sounds,
    playlists,
    queue,
    loading,
    error,
    backgroundTrack,
    backgroundPlaying,
    backgroundVolume,
    loopBackground,
    crossfadeSeconds,
    effectTrack,
    effectPlaying,
    effectVolume,
    backgroundCurrentTime,
    backgroundDuration,
    backgroundHistoryLength,
    quickEffects,
    fetchSounds,
    fetchPlaylists,
    fetchQuickEffects,
    playBackground,
    toggleBackground,
    stopBackground,
    setBackgroundVolume,
    setLoopBackground,
    setCrossfadeSeconds,
    playEffect,
    stopEffect,
    setEffectVolume,
    uploadSound,
    enqueueTrack,
    removeQueuedTrack,
    clearQueue,
    playNextQueued,
    playPreviousBackground,
    startPlaylist,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    configureQuickEffect,
  };

  return (
    <SoundPlayerContext.Provider value={value}>
      {children}
      {[0, 1].map((deck) => (
        <audio
          key={deck}
          ref={(node) => { backgroundAudio.current[deck] = node; }}
          onEnded={playNextQueued}
          onTimeUpdate={(event) => {
            if (deck === activeDeck) setBackgroundCurrentTime(event.currentTarget.currentTime || 0);
          }}
          onLoadedMetadata={(event) => {
            if (deck === activeDeck) setBackgroundDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          }}
          onDurationChange={(event) => {
            if (deck === activeDeck) setBackgroundDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          }}
        />
      ))}
      <audio ref={effectsAudio} onEnded={() => setEffectPlaying(false)} />
    </SoundPlayerContext.Provider>
  );
}

function VolumeControl({ label, value, onChange }) {
  return (
    <label className="sound-volume-control">
      <VolumeDown fontSize="small" />
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <VolumeUp fontSize="small" />
    </label>
  );
}

function QuickEffects({ configurable = false }) {
  const player = useSoundPlayer();
  const [configurationError, setConfigurationError] = useState('');

  const assignDroppedEffect = async (event, slot) => {
    event.preventDefault();
    event.stopPropagation();
    const soundId = Number(event.dataTransfer.getData('application/x-kachhapa-sound-id'));
    const sound = player.sounds.find((candidate) => candidate.id === soundId);
    if (!sound || sound.category !== 'sfx') {
      setConfigurationError('Drag a Sound FX library item onto a Quick FX button.');
      return;
    }
    try {
      await player.configureQuickEffect(slot, sound);
      setConfigurationError('');
    } catch (requestError) {
      setConfigurationError(requestError.response?.data?.message || 'Unable to configure that Quick FX slot.');
    }
  };

  return (
    <div className={`sound-quick-effects${configurable ? ' is-configurable' : ''}`}>
      <div className="sound-quick-effects-heading">
        <strong>Quick FX</strong>
        {configurable && <span>Drag five Sound FX clips here to configure them</span>}
      </div>
      <div className="sound-quick-effects-grid">
        {player.quickEffects.map(({ slot, sound }) => (
          <button
            type="button"
            key={slot}
            className={sound ? 'is-assigned' : ''}
            onClick={() => sound && player.playEffect(sound)}
            onDragOver={configurable ? (event) => event.preventDefault() : undefined}
            onDrop={configurable ? (event) => assignDroppedEffect(event, slot) : undefined}
            title={sound ? `Play ${sound.name}` : configurable ? `Drop a sound effect into slot ${slot}` : `Quick FX slot ${slot} is empty`}
          >
            <span>{slot}</span>
            <GraphicEq fontSize="small" />
            <strong>{sound?.name || 'Empty'}</strong>
          </button>
        ))}
      </div>
      {configurationError && <small className="sound-quick-effects-error">{configurationError}</small>}
    </div>
  );
}

export function DMSoundPlayerWorkspace() {
  const player = useSoundPlayer();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [upload, setUpload] = useState({ file: null, name: '', category: 'music' });
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistSelections, setPlaylistSelections] = useState({});
  const [draggingFiles, setDraggingFiles] = useState(false);
  const visibleSounds = player.sounds.filter((sound) => (
    (filter === 'all' || sound.category === filter) &&
    sound.name.toLowerCase().includes(search.trim().toLowerCase())
  ));

  const submitUpload = async (event) => {
    event.preventDefault();
    if (!upload.file) return;
    setUploading(true);
    setUploadError('');
    try {
      await player.uploadSound({
        ...upload,
        name: upload.name.trim() || upload.file.name.replace(/\.[^.]+$/, ''),
      });
      setUpload({ file: null, name: '', category: 'music' });
      event.target.reset();
    } catch (requestError) {
      setUploadError(requestError.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const submitPlaylist = async (event) => {
    event.preventDefault();
    const name = newPlaylistName.trim();
    if (!name) return;
    try {
      await player.createPlaylist(name);
      setNewPlaylistName('');
    } catch (requestError) {
      setUploadError(requestError.response?.data?.message || 'Unable to create the playlist.');
    }
  };

  const assignToPlaylist = async (sound) => {
    const playlistId = Number(playlistSelections[sound.id]);
    if (!playlistId) return;
    try {
      await player.addTrackToPlaylist(playlistId, sound.id);
    } catch (requestError) {
      setUploadError(requestError.response?.data?.message || 'Unable to update the playlist.');
    }
  };

  const uploadDroppedFiles = async (files) => {
    const audioFiles = [...files].filter((file) => (
      file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|webm|flac)$/i.test(file.name)
    ));
    if (!audioFiles.length) {
      setUploadError('Drop one or more audio files onto the Music Player.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      for (const file of audioFiles) {
        await player.uploadSound({
          file,
          name: file.name.replace(/\.[^.]+$/, ''),
          category: upload.category,
        });
      }
    } catch (requestError) {
      setUploadError(requestError.response?.data?.message || 'One or more files could not be uploaded.');
    } finally {
      setUploading(false);
      setDraggingFiles(false);
    }
  };

  const handleWorkspaceDrop = (event) => {
    event.preventDefault();
    setDraggingFiles(false);
    if (event.dataTransfer.files?.length) uploadDroppedFiles(event.dataTransfer.files);
  };

  return (
    <div
      className={`sound-workspace${draggingFiles ? ' is-file-dragging' : ''}`}
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types || []).includes('Files')) setDraggingFiles(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDraggingFiles(false);
      }}
      onDrop={handleWorkspaceDrop}
    >
      {draggingFiles && <div className="sound-drop-overlay"><Upload /><strong>Drop audio files to upload</strong><span>They will use the selected upload type: {upload.category}</span></div>}
      <div className="sound-decks">
        <section className="sound-deck sound-deck-background">
          <div className="sound-deck-icon"><LibraryMusic /></div>
          <div className="sound-deck-main">
            <span className="sound-eyebrow">Background deck</span>
            <h3>{player.backgroundTrack?.name || 'Choose ambience or music'}</h3>
            <p>{player.backgroundPlaying ? 'Playing continuously under your session' : 'Stopped'}</p>
            <VolumeControl label="Background volume" value={player.backgroundVolume} onChange={player.setBackgroundVolume} />
          </div>
          <div className="sound-deck-controls">
            <button type="button" onClick={player.toggleBackground} disabled={!player.backgroundTrack} aria-label={player.backgroundPlaying ? 'Pause background' : 'Play background'}>
              {player.backgroundPlaying ? <Pause /> : <PlayArrow />}
            </button>
            <button type="button" onClick={player.stopBackground} disabled={!player.backgroundTrack} aria-label="Stop background"><Stop /></button>
          </div>
          <div className="sound-deck-options">
            <label><input type="checkbox" checked={player.loopBackground} onChange={(event) => player.setLoopBackground(event.target.checked)} /> Loop</label>
            <label>
              Crossfade
              <select value={player.crossfadeSeconds} onChange={(event) => player.setCrossfadeSeconds(Number(event.target.value))}>
                <option value="0">Off</option>
                <option value="2">2 sec</option>
                <option value="3">3 sec</option>
                <option value="5">5 sec</option>
                <option value="8">8 sec</option>
              </select>
            </label>
          </div>
        </section>

        <section className="sound-deck sound-deck-effects">
          <div className="sound-deck-icon"><GraphicEq /></div>
          <div className="sound-deck-main">
            <span className="sound-eyebrow">Sound FX deck</span>
            <h3>{player.effectTrack?.name || 'Ready for a one-shot effect'}</h3>
            <p>{player.effectPlaying ? 'Effect playing' : 'Independent from background audio'}</p>
            <VolumeControl label="Effects volume" value={player.effectVolume} onChange={player.setEffectVolume} />
          </div>
          <div className="sound-deck-controls">
            <button type="button" onClick={() => player.effectTrack && player.playEffect(player.effectTrack)} disabled={!player.effectTrack} aria-label="Replay sound effect"><PlayArrow /></button>
            <button type="button" onClick={player.stopEffect} disabled={!player.effectTrack} aria-label="Stop sound effect"><Stop /></button>
          </div>
        </section>
      </div>

      {(player.error || uploadError) && <div className="sound-error" role="alert">{uploadError || player.error}</div>}

      <section className="sound-quick-effects-panel">
        <QuickEffects configurable />
      </section>

      <section className="sound-playlists-panel">
        <div className="sound-library-header">
          <div><span className="sound-eyebrow">Campaign playlists</span><h3>Scene music</h3></div>
          <form className="sound-playlist-create" onSubmit={submitPlaylist}>
            <input aria-label="New playlist name" maxLength="120" placeholder="New playlist" value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} />
            <button type="submit" disabled={!newPlaylistName.trim()}><Add fontSize="small" /> Create</button>
          </form>
        </div>
        <div className="sound-playlist-grid">
          {player.playlists.map((playlist) => (
            <article className="sound-playlist-card" key={playlist.id}>
              <div>
                <strong>{playlist.name}</strong>
                <small>{playlist.tracks.length} track{playlist.tracks.length === 1 ? '' : 's'}</small>
              </div>
              <label className="sound-shuffle-toggle" title="Randomize this playlist each time it starts">
                <input type="checkbox" checked={playlist.shuffle} onChange={(event) => player.updatePlaylist(playlist.id, { shuffle: event.target.checked })} />
                <Shuffle fontSize="small" /> Shuffle
              </label>
              <button type="button" onClick={() => player.startPlaylist(playlist)} disabled={!playlist.tracks.length}><PlayArrow fontSize="small" /> Play</button>
              <button type="button" className="sound-icon-danger" onClick={() => player.deletePlaylist(playlist.id)} aria-label={`Delete ${playlist.name}`}><DeleteOutline fontSize="small" /></button>
              {playlist.tracks.length > 0 && (
                <div className="sound-playlist-tracks">
                  {playlist.tracks.map((track) => (
                    <span key={track.id}>{track.name}<button type="button" onClick={() => player.removeTrackFromPlaylist(playlist.id, track.id)} aria-label={`Remove ${track.name} from ${playlist.name}`}><Clear fontSize="inherit" /></button></span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="sound-library-layout">
        <section className="sound-library-panel">
          <div className="sound-library-header">
            <div><span className="sound-eyebrow">Shared with every DM</span><h3>Sound library</h3></div>
            <input type="search" placeholder="Search sounds" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="sound-filter-tabs" role="tablist" aria-label="Sound categories">
            {['all', 'music', 'environment', 'sfx'].map((category) => (
              <button type="button" className={filter === category ? 'is-active' : ''} onClick={() => setFilter(category)} key={category}>
                {category === 'sfx' ? 'Sound FX' : category[0].toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
          <div className="sound-library-list">
            {player.loading ? <p className="sound-empty">Loading shared sounds…</p> : visibleSounds.length === 0 ? (
              <div className="sound-empty"><MusicNote /><strong>No sounds here yet</strong><span>Upload the first track using the panel beside the library.</span></div>
            ) : visibleSounds.map((sound) => (
              <div
                className={`sound-library-row${sound.category === 'sfx' ? ' is-draggable' : ''}`}
                key={sound.id}
                draggable={sound.category === 'sfx'}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-kachhapa-sound-id', String(sound.id));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <span className={`sound-category-mark is-${sound.category}`}><MusicNote fontSize="small" /></span>
                <span className="sound-library-copy"><strong>{sound.name}</strong><small>{sound.category === 'sfx' ? 'Sound FX' : sound.category} · Added by {sound.uploadedBy || 'a DM'}</small></span>
                <div className="sound-library-actions">
                  {sound.category !== 'sfx' && <button type="button" className="sound-queue-button" onClick={() => player.enqueueTrack(sound)} title="Add to queue"><QueueMusic fontSize="small" /> Queue</button>}
                  <button type="button" className="sound-play-button" onClick={() => sound.category === 'sfx' ? player.playEffect(sound) : player.playBackground(sound)}>
                    <PlayArrow fontSize="small" /> {sound.category === 'sfx' ? 'Fire' : 'Play'}
                  </button>
                </div>
                {sound.category !== 'sfx' && player.playlists.length > 0 && (
                  <div className="sound-playlist-assignment">
                    <select aria-label={`Playlist for ${sound.name}`} value={playlistSelections[sound.id] || ''} onChange={(event) => setPlaylistSelections((current) => ({ ...current, [sound.id]: event.target.value }))}>
                      <option value="">Assign to playlist…</option>
                      {player.playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                    </select>
                    <button type="button" disabled={!playlistSelections[sound.id]} onClick={() => assignToPlaylist(sound)}><Add fontSize="small" /> Add</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <form className="sound-upload-panel" onSubmit={submitUpload}>
          <div className="sound-upload-icon"><Upload /></div>
          <span className="sound-eyebrow">Add to the server</span>
          <h3>Upload a sound</h3>
          <p>Uploaded sounds become available to every DM who can open this player. You can also drop audio files anywhere on this page.</p>
          <label>Audio file<input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac" required onChange={(event) => setUpload((current) => ({ ...current, file: event.target.files[0] || null }))} /></label>
          <label>Display name<input type="text" maxLength="120" placeholder={upload.file?.name.replace(/\.[^.]+$/, '') || 'e.g. Forest at dusk'} value={upload.name} onChange={(event) => setUpload((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Type<select value={upload.category} onChange={(event) => setUpload((current) => ({ ...current, category: event.target.value }))}><option value="music">Background music</option><option value="environment">Environment</option><option value="sfx">Sound effect</option></select></label>
          <button type="submit" className="sound-upload-button" disabled={!upload.file || uploading}><Add fontSize="small" /> {uploading ? 'Uploading…' : 'Add to library'}</button>
          <small>MP3, WAV, OGG, M4A, AAC, WebM, or FLAC · 50 MB maximum</small>
        </form>
      </div>
    </div>
  );
}

export function DMSoundPlayerBar({ hidden, onExpand, quickFxConfigurable = false }) {
  const player = useSoundPlayer();
  const [trayOpen, setTrayOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [position, setPosition] = useState(storedPlayerPosition);
  const [dragging, setDragging] = useState(false);
  const playerElement = useRef(null);
  const dragGesture = useRef(null);
  const suppressIconClickUntil = useRef(0);

  const clampCurrentPosition = useCallback((currentPosition) => {
    if (!currentPosition || !playerElement.current) return currentPosition;
    const bounds = playerElement.current.getBoundingClientRect();
    const nextPosition = clampPlayerPosition(currentPosition.x, currentPosition.y, bounds.width, bounds.height);
    rememberPlayerPosition(nextPosition);
    return nextPosition;
  }, []);

  useEffect(() => {
    const handleResize = () => setPosition(clampCurrentPosition);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampCurrentPosition]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPosition((currentPosition) => currentPosition ? clampCurrentPosition(currentPosition) : currentPosition);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [trayOpen, clampCurrentPosition]);

  if (hidden) return null;
  const progress = player.backgroundDuration > 0
    ? Math.min(100, (player.backgroundCurrentTime / player.backgroundDuration) * 100)
    : 0;

  const toggleFromIcon = () => {
    if (Date.now() < suppressIconClickUntil.current) {
      suppressIconClickUntil.current = 0;
      return;
    }
    if (player.backgroundTrack) player.toggleBackground();
    else setTrayOpen(true);
  };

  const beginPlayerDrag = (event) => {
    if (event.button !== 0 || !playerElement.current) return;
    const bounds = playerElement.current.getBoundingClientRect();
    dragGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      width: bounds.width,
      height: bounds.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePlayer = (event) => {
    const gesture = dragGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < 5) return;
    gesture.moved = true;
    setDragging(true);
    setPosition(clampPlayerPosition(
      gesture.originX + deltaX,
      gesture.originY + deltaY,
      gesture.width,
      gesture.height,
    ));
    event.preventDefault();
  };

  const finishPlayerDrag = (event) => {
    const gesture = dragGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.moved) {
      const finalPosition = clampPlayerPosition(
        gesture.originX + event.clientX - gesture.startX,
        gesture.originY + event.clientY - gesture.startY,
        gesture.width,
        gesture.height,
      );
      setPosition(finalPosition);
      rememberPlayerPosition(finalPosition);
      suppressIconClickUntil.current = Date.now() + 300;
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragGesture.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={playerElement}
      className={`sound-mini-player${trayOpen ? ' is-tray-open' : ' is-collapsed'}${dragging ? ' is-dragging' : ''}`}
      style={position ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto' } : undefined}
      aria-label="DM sound player"
    >
      <div
        className="sound-progress-control"
        style={{ '--sound-progress': `${progress}%` }}
        onPointerDown={beginPlayerDrag}
        onPointerMove={movePlayer}
        onPointerUp={finishPlayerDrag}
        onPointerCancel={finishPlayerDrag}
        title="Drag to move the player"
      >
        <button type="button" className="sound-progress-button" onClick={toggleFromIcon} aria-label={player.backgroundTrack ? (player.backgroundPlaying ? 'Pause background' : 'Play background') : 'Open sound controls'}>
          {player.backgroundPlaying ? <Pause /> : player.backgroundTrack ? <PlayArrow /> : <MusicNote />}
        </button>
      </div>
      {!trayOpen && (
        <button type="button" className="sound-tray-reveal" onClick={() => setTrayOpen(true)} aria-label="Open compact sound player"><ChevronLeft fontSize="small" /></button>
      )}
      {trayOpen && (
        <>
          <div className="sound-mini-copy">
            <strong>{player.backgroundTrack?.name || 'DM Sound Player'}</strong>
            <span>{player.backgroundPlaying ? 'Playing' : player.effectPlaying ? `FX: ${player.effectTrack?.name}` : 'Ready'}</span>
          </div>
          <button type="button" onClick={player.playPreviousBackground} disabled={!player.backgroundHistoryLength} aria-label="Previous track"><ChevronLeft /></button>
          <button type="button" onClick={player.toggleBackground} disabled={!player.backgroundTrack} aria-label={player.backgroundPlaying ? 'Pause background' : 'Play background'}>{player.backgroundPlaying ? <Pause /> : <PlayArrow />}</button>
          <button type="button" onClick={player.playNextQueued} disabled={!player.queue.length} aria-label="Next track"><SkipNext /></button>
          <button type="button" className="sound-mini-queue-toggle" onClick={() => setPanelOpen((open) => !open)} aria-label="Show queue, playlists, and Quick FX" aria-expanded={panelOpen}><ExpandMore className={panelOpen ? 'is-open' : ''} /></button>
          <button type="button" className="sound-tray-collapse" onClick={() => { setTrayOpen(false); setPanelOpen(false); }} aria-label="Collapse sound player"><ChevronRight fontSize="small" /></button>
        </>
      )}
      {trayOpen && panelOpen && (
        <section className="sound-mini-panel">
          <div className="sound-mini-panel-heading"><strong>Up next</strong><span>{player.queue.length} queued</span></div>
          <div className="sound-mini-queue">
            {player.queue.length === 0 ? <p>Queue is empty. Add tracks from the sound library or start a playlist.</p> : player.queue.map((track, index) => (
              <div key={`${track.id}-${index}`}><MusicNote fontSize="small" /><span>{track.name}</span><button type="button" onClick={() => player.removeQueuedTrack(index)} aria-label={`Remove ${track.name} from queue`}><Clear fontSize="small" /></button></div>
            ))}
          </div>
          <div className="sound-mini-queue-actions">
            <button type="button" onClick={player.playNextQueued} disabled={!player.queue.length}><SkipNext fontSize="small" /> Play next</button>
            <button type="button" onClick={player.clearQueue} disabled={!player.queue.length}><Clear fontSize="small" /> Clear</button>
          </div>
          <div className="sound-mini-playlists">
            <strong>Playlists</strong>
            {player.playlists.map((playlist) => <button type="button" key={playlist.id} onClick={() => player.startPlaylist(playlist)} disabled={!playlist.tracks.length}>{playlist.shuffle && <Shuffle fontSize="small" />}{playlist.name}<span>{playlist.tracks.length}</span></button>)}
          </div>
          <QuickEffects configurable={quickFxConfigurable} />
          <button type="button" className="sound-open-workspace" onClick={onExpand}><LibraryMusic fontSize="small" /> Open Music Player</button>
        </section>
      )}
    </div>
  );
}
