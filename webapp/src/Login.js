// Login.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // Import axios

import './Login.css';

function Login({ setIsLoggedIn, setToken, setUserID, setIsLoading, setAppUsername, resetCampaignSelection, expireSession }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  function requestedRedirect() {
    const value = new URLSearchParams(window.location.search).get('redirect');
    if (!value) return null;
    try {
      const target = new URL(value, window.location.origin);
      if (target.origin !== window.location.origin || !target.pathname.startsWith('/')) return null;
      return `${target.pathname}${target.search}${target.hash}`;
    } catch (_error) {
      return null;
    }
  }

  function finishAuthentication(fallback = null) {
    const target = requestedRedirect() || fallback;
    if (target) navigate(target, { replace: true });
  }

  function authenticateUserWithToken(token) {
    console.log("Authenticating stored session");
    setIsLoading(true); // Set loading to true when starting authentication
    axios.post('/api/verify', { token: token })
      .then(response => {
        console.log("Response from verify:", response.data);
        if (response.data.success) {
          console.log("Token is valid");
          setIsLoggedIn(true);
          // Store the token in local storage
          localStorage.setItem('token', token);
          setToken(token); // Set the token
          console.log("Setting Username:", response.data.username);
          setAppUsername(response.data.username); // Set the username
          console.log("Setting User ID:", response.data.id);
          setUserID(response.data.id); // Set the userID
          setIsLoading(false); // Set loading to false when user data has been fetched
          setIsLoggedIn(true); // Set logged in to true

          // Check for a redirect URL
          console.log("Checking for redirect URL");
          console.log("Window Location:", window.location);
          console.log("Current URL:", window.location.href);
          const urlParams = new URLSearchParams(window.location.search);
          console.log("URL Params:", urlParams);

          const redirectUrl = urlParams.get('redirect');
          console.log("Redirect URL:", redirectUrl);

          if (redirectUrl) {
            finishAuthentication();
          }
        } else {
          expireSession?.();
          setIsLoading(false); // Set loading to false if the token was invalid
        }
      })
      .catch(error => {
        console.error(error);
        if (expireSession) expireSession();
        else {
          localStorage.removeItem('token');
          setToken('');
          setIsLoggedIn(false);
          resetCampaignSelection?.();
        }
        if (error.response && error.response.status === 401) {
          console.log("** Unauthorized request- bad token **");
        }
        setIsLoading(false); // Set loading to false if the request fails
      });
  }

  // Authenticate
  useEffect(() => {
    const token = localStorage.getItem('token');

    if (token) {
      authenticateUserWithToken(token);
      return;
    }

    // localStorage is origin-scoped. Recover the shared HttpOnly session when
    // arriving from maps.*, tools.*, mtg.*, or the primary hostname.
    setIsLoading(true);
    axios.get('/api/session', { withCredentials: true })
      .then(({ data }) => {
        if (!data?.success || !data.access_token) return;
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);
        setUserID(data.id);
        setAppUsername(data.username);
        setIsLoggedIn(true);
        finishAuthentication();
      })
      .catch(error => {
        if (error.response?.status !== 401) console.error('Unable to restore shared session:', error);
      })
      .finally(() => setIsLoading(false));
  }, []);


  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    axios.post('/api/login', {
      username,
      password
    })
    .then(response => {
      console.log("Response from login:", response);
      console.log("LOGIN-", response.data);
      const redirectTarget = requestedRedirect();
      const redirectCampaign = redirectTarget ? new URL(redirectTarget, window.location.origin).searchParams.get('campaignID') : null;
      if (!redirectCampaign) resetCampaignSelection?.();
      setToken(response.data.access_token);
      localStorage.setItem('token', response.data.access_token);
      setUserID(response.data.userID);
      console.log("Setting USERID:", response.data.userID);
      setAppUsername(response.data.username || username.toLowerCase());
      console.log("Setting Username:", username);
      
      setIsLoggedIn(true);
      finishAuthentication('/accountProfile');
      console.log("Navigating to requested entry point or accountProfile");
    })
      .catch(error => {
        const serverMessage = error.response?.data?.message || error.response?.data?.error;
        if (serverMessage) {
          setError(serverMessage);
        } else if (!error.response) {
          setError('Unable to connect to the server backend. Check that it is running and try again.');
        } else {
          setError(`The server could not complete the login request (HTTP ${error.response.status}).`);
        }
        console.log('Error logging in-', error);
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <div className="login-container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Connecting…' : 'Login'}
        </button>
      </form>
      {error && <p className="error-message">{error}</p>}
      <Link to="/register">Register</Link>
    </div>
  );
}

export default Login;
