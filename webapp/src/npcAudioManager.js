import axios from 'axios';

// One controller for every editor/card/button. Resolver supplies requests, never Audio elements.
export class NpcAudioManager {
  constructor({ createAudio = url => new Audio(url), getBlob = (url, headers) => axios.get(url, { headers, responseType: 'blob' }), makeUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url) } = {}) {
    Object.assign(this, { createAudio, getBlob, makeUrl, revokeUrl });
    this.volume = 1; this.muted = false; this.current = null; this.sequence = 0;
    this.listeners = new Set(); this.headers = {}; this.campaignId = null; this.owner = false;
    this.status = { playing: false, error: '', label: '' };
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  update(value) { this.status = { ...this.status, ...value }; this.listeners.forEach(fn => fn(this.status)); }
  configure(headers, campaignId) {
    if (String(this.campaignId) !== String(campaignId)) this.stopVoice();
    this.headers = headers; this.campaignId = campaignId;
  }
  setOwner(owner) { if (!owner && this.owner) this.stopVoice(); this.owner = owner; }
  setVolume(volume) { this.volume = Math.max(0, Math.min(1, Number(volume) || 0)); this.applyGain(); }
  setMuted(muted) { this.muted = Boolean(muted); this.applyGain(); }
  applyGain() {
    if (!this.current?.audio) return;
    const gain = (this.muted ? 0 : this.volume) * this.current.line.gain;
    if (this.current.gainNode) { this.current.gainNode.gain.value = gain; this.current.audio.volume = 1; }
    else this.current.audio.volume = Math.min(1, gain);
  }
  stopVoice() {
    this.sequence += 1;
    const current = this.current; this.current = null;
    if (current) {
      if (current.audio) { current.audio.pause(); current.audio.removeAttribute?.('src'); current.audio.load?.(); }
      current.source?.disconnect(); current.gainNode?.disconnect();
      if (current.url) this.revokeUrl(current.url);
    }
    this.update({ playing: false, label: '' });
  }
  async playVoiceLine(line, { automatic = false, priority = 0, interrupt = false } = {}) {
    if (!this.owner || (automatic && this.muted)) return false;
    if (!line?.enabled || !line.asset?.url || line.asset.status !== 'ready') {
      this.update({ error: 'This voice recording is unavailable. Replace its audio in NPC Media.' }); return false;
    }
    if (automatic && this.current && (!this.current.automatic || !interrupt || priority <= this.current.priority)) return false;
    this.stopVoice(); const sequence = this.sequence;
    const current = { line, automatic, priority }; this.current = current;
    this.update({ playing: true, label: line.label, error: '' });
    // AudioContext must be resumed during the user's gesture, before awaiting the network.
    const Context = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (Context) {
      try { this.context ||= new Context(); await this.context.resume(); } catch { /* Audio element still reports autoplay failure. */ }
    }
    try {
      const { data } = await this.getBlob(line.asset.url, this.headers);
      if (this.sequence !== sequence) return false;
      current.url = this.makeUrl(data); current.audio = this.createAudio(current.url);
      if (this.context) {
        current.source = this.context.createMediaElementSource(current.audio);
        current.gainNode = this.context.createGain();
        current.source.connect(current.gainNode); current.gainNode.connect(this.context.destination);
      }
      this.applyGain();
      current.audio.onended = () => { if (this.current === current) this.stopVoice(); };
      current.audio.onerror = () => { if (this.current === current) { this.stopVoice(); this.update({ error: 'Audio could not be decoded. Replace the recording and try again.' }); } };
      await current.audio.play();
      if (this.sequence !== sequence) return false;
      return true;
    } catch (error) {
      if (this.sequence === sequence) {
        this.stopVoice();
        this.update({ error: error.name === 'NotAllowedError' ? 'Browser blocked playback. Press a voice Play button to enable audio, then retry the action.' : 'Could not load this voice recording. Check the asset and try Play again.' });
      }
      return false;
    }
  }
}
export const npcAudio = new NpcAudioManager();
