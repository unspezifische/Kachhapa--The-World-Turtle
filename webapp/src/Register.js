// Register.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // Import axios

function Register({ setIsLoggedIn, setToken, setUsername: setAppUsername, setUserID }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const navigate = useNavigate();

  const register = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    axios.post('http://127.0.0.1:5001/api/register', {
      username: username,
      password: password
    }).then(response => {
      console.log(response);
      if (response.data.access_token) {
        setToken(response.data.access_token);
        setUserID(response.data.user_id);
        localStorage.setItem('access_token', response.data.access_token);

        setAppUsername(username); // Update username state in App.js

        setIsLoggedIn(true); // Update isLoggedIn state in App.js
        setToken(response.data.access_token); // Update token state in App.js

        navigate("/accoutProfile");
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
          onChange={e => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          onChange={e => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm Password"
          onChange={e => setConfirmPassword(e.target.value)}
        />
        {password !== confirmPassword && confirmPassword !== '' && (
          <span style={{ color: 'red', marginLeft: '10px' }}>Passwords do not match</span>
        )}
        <button type="submit">Register</button>
      </form>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      <Link to="/login">Log In</Link>
    </div>
  );
}

export default Register;