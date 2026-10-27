// Register.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // Import axios

function Register({ setIsLoggedIn, setToken, setAppUsername, setUserID }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const navigate = useNavigate();

  const register = (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    axios.post('/api/register', {
      username: username,
      password: password,
    }).then(response => {
      if (response.data.access_token) {
        setToken(response.data.access_token);
        setUserID(response.data.user_id);
        localStorage.setItem('access_token', response.data.access_token);

        setAppUsername(username); // Update username state in App.js

        setIsLoggedIn(true); // Update isLoggedIn state in App.js
        setToken(response.data.access_token); // Update token state in App.js

        navigate("/accountProfile");
      } else {
        setErrorMessage('Registration Failed');
      }
    }).catch(error => {
      console.error(error);
      if (error.response && error.response.data.message) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage('Registration Failed');
      }
    });
  };

  return (
    <div className="register-container">
      <h1>Register</h1>
      <form onSubmit={(e) => register(e)}>
        <input
          type="text"
          placeholder="Username"
          autoComplete="username"
          onChange={e => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="new-password"
          minLength={8}
          onChange={e => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm Password"
          autoComplete="new-password"
          minLength={8}
          onChange={e => setConfirmPassword(e.target.value)}
        />
        {password !== confirmPassword && confirmPassword !== '' && (
          <span style={{ color: 'var(--danger)', marginLeft: '10px' }}>Passwords do not match</span>
        )}
        <button type="submit">Register</button>
      </form>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      <Link to="/login">Log In</Link>
    </div>
  );
}

export default Register;
