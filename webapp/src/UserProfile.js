import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import ImageCropModal from './ImageCropModal';
import './AccountProfile.css';
import './UserProfile.css';

export default function UserProfile({ headers }) {
  const navigate = useNavigate();
  const authorization = headers?.Authorization;
  const apiHeaders = useMemo(() => ({ Authorization: authorization }), [authorization]);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authorization) return;
    let alive = true;
    axios.get('/api/profile', { headers: apiHeaders }).then(response => {
      if (!alive) return;
      setProfile(response.data);
      setName(response.data.real_name || '');
      setBio(response.data.bio || '');
    }).catch(() => { if (alive) setError('Unable to load your profile.'); });
    return () => { alive = false; };
  }, [authorization, apiHeaders]);

  useEffect(() => {
    if (!profile?.has_profile_photo || !authorization) { setPhotoUrl(''); return; }
    let alive = true;
    let objectUrl = '';
    axios.get('/api/profile/photo', { headers: apiHeaders, responseType: 'blob' }).then(response => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(response.data);
      setPhotoUrl(objectUrl);
    }).catch(() => { if (alive) setError('Unable to load your profile photo.'); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [profile?.has_profile_photo, profile?.profile_photo_updated, authorization, apiHeaders]);

  const saveProfile = async event => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const response = await axios.patch('/api/profile', { real_name: name, bio }, { headers: apiHeaders });
      setProfile(response.data); setNotice('Profile saved.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to save your profile.'); }
    finally { setSaving(false); }
  };

  const uploadPhoto = async file => {
    if (!file) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const body = new FormData(); body.append('photo', file);
      await axios.post('/api/profile/photo', body, { headers: apiHeaders });
      setProfile(current => ({ ...current, has_profile_photo: true, profile_photo_updated: Date.now() }));
      setNotice('Profile photo updated.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to upload the photo.'); }
    finally { setSaving(false); }
  };

  const choosePhoto = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPendingPhoto(file);
  };

  const removePhoto = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await axios.delete('/api/profile/photo', { headers: apiHeaders });
      setProfile(current => ({ ...current, has_profile_photo: false }));
      setNotice('Profile photo removed.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to remove the photo.'); }
    finally { setSaving(false); }
  };

  const changePassword = async event => {
    event.preventDefault(); setError(''); setNotice('');
    if (passwords.newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (passwords.newPassword !== passwords.confirmPassword) { setError('New passwords do not match.'); return; }
    setSaving(true);
    try {
      const response = await axios.patch('/api/profile/password', { current_password: passwords.currentPassword, new_password: passwords.newPassword }, { headers: apiHeaders });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setNotice(response.data?.message || 'Password updated successfully.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to update the password.'); }
    finally { setSaving(false); }
  };

  return <main className="user-profile-page"><div className="user-profile-wrap">
    <button type="button" className="user-profile-back" onClick={() => navigate('/accountProfile')}>← Dashboard</button>
    <header className="user-profile-header"><span className="dashboard-eyebrow">Kachhapa · your account</span><h1>User profile</h1><p>A little about the person behind the characters. These details are visible only to you for now.</p></header>
    {error && <div className="dashboard-alert dashboard-error" role="alert">{error}</div>}{notice && <div className="dashboard-alert" role="status">{notice}</div>}
    <div className="user-profile-grid"><section className="user-profile-card user-profile-photo-card"><h2>Profile picture</h2><div className="user-profile-portrait">{photoUrl ? <img src={photoUrl} alt="Your profile" /> : <span>{(name || profile?.username || '?').slice(0, 2).toUpperCase()}</span>}</div><p>Choose an image that feels like you. PNG, JPEG, WebP, or GIF; up to 5 MB. Animated GIFs keep their motion.</p><label className="dashboard-button dashboard-button-gold">Upload picture<input aria-label="Upload profile picture" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={choosePhoto} disabled={saving} /></label>{profile?.has_profile_photo && <button type="button" className="user-profile-link" onClick={removePhoto} disabled={saving}>Remove picture</button>}</section>
      <section className="user-profile-card"><h2>About you</h2><form onSubmit={saveProfile}><label>Username<input type="text" value={profile?.username || ''} disabled /></label><label>Real name<input type="text" value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="Your name" /></label><label>Short bio<textarea value={bio} maxLength={600} rows={5} onChange={event => setBio(event.target.value)} placeholder="What do you enjoy bringing to a table?" /></label><div className="user-profile-form-bottom"><small>{bio.length}/600 characters</small><button type="submit" className="dashboard-button dashboard-button-gold" disabled={saving || !profile}>Save profile</button></div></form></section></div>
    <details className="user-profile-settings"><summary><span>Account settings</span><small>Password and security</small></summary><div className="user-profile-settings-body"><h2>Change password</h2><p>Use at least 8 characters. A long, unique passphrase is a good choice.</p><form onSubmit={changePassword}><label>Current password<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={event => setPasswords(current => ({ ...current, currentPassword: event.target.value }))} required /></label><label>New password<input type="password" autoComplete="new-password" minLength={8} value={passwords.newPassword} onChange={event => setPasswords(current => ({ ...current, newPassword: event.target.value }))} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={passwords.confirmPassword} onChange={event => setPasswords(current => ({ ...current, confirmPassword: event.target.value }))} required /></label><button type="submit" className="dashboard-button dashboard-button-gold" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button></form></div></details>
    <ImageCropModal file={pendingPhoto} show={Boolean(pendingPhoto)} title="Crop & position your profile picture" busy={saving} onCancel={() => setPendingPhoto(null)} onConfirm={async file => { await uploadPhoto(file); setPendingPhoto(null); }} />
  </div></main>;
}
