// Login.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // Import axios

import './Login.css';

function Login({ setIsLoggedIn, setToken, setUserID, setIsLoading, setAppUsername }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  function authenticateUserWithToken(token) {
    console.log("Authenticating with token:", token);
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
            // Decode the redirect URL
            const decodedRedirectUrl = decodeURIComponent(redirectUrl);
            console.log("Decoded Redirect URL:", decodedRedirectUrl);

            // Redirect to the intended URL using window.location.assign
            try {
              window.location.assign(decodedRedirectUrl);
            } catch (error) {
              console.warn("window.location.assign failed", error);
              // Fallback to window.location.href if window.location.assign fails
              window.location.href = decodedRedirectUrl;
            }
          }
        } else {
          setIsLoading(false); // Set loading to false if the token was invalid
        }
      })
      .catch(error => {
        console.error(error);
        localStorage.removeItem('token'); // Remove invalid token
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
    }
  }, []);


  const handleSubmit = (event) => {
    event.preventDefault();

    axios.post('/api/login', {
      username,
      password
    })
    .then(response => {
      console.log("Response from login:", response);
      console.log("LOGIN-", response.data);
      setToken(response.data.access_token);
      console.log("Setting Token:", response.data.access_token);
      localStorage.setItem('token', response.data.access_token);
      setUserID(response.data.userID);
      console.log("Setting USERID:", response.data.userID);
      setAppUsername(username);
      console.log("Setting Username:", username);
      
      setIsLoggedIn(true);
      navigate("/accountProfile");
      console.log("Navigating to accountProfile");
    })
      .catch(error => {
        setError(error.response.data.message);
        console.log('Error logging in-', error);
    });
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
        <button type="submit">Login</button>
      </form>
      {error && <p className="error-message">{error}</p>}
      <Link to="/register">Register</Link>
    </div>
  );
}

export default Login;
