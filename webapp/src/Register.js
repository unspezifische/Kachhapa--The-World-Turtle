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

  // Define a blank character state
  const [character, setCharacter] = useState({
      Name: '',
      system: 'D&D 5e',
      Class: null,
      Level: null,
      Background: null,
      Race: null,
      Alignment: null,
      ExperiencePoints: 0,

      abilityScores: {
          Strength: 0,
          Dexterity: 0,
          Constitution: 0,
          Intelligence: 0,
          Wisdom: 0,
          Charisma: 0,
      },
      proficiencyBonus: 2,  // Determined by level
      SavingThrows: {
          strength: 0,
          dexterity: 0,
          constitution: 0,
          intelligence: 0,
          wisdom: 0,
          charisma: 0,
      },    // Calculated by modifiers
      Skills: {
          Acrobatics: 0,
          'Animal Handling': 0,
          Arcana: 0,
          Athletics: 0,
          Deception: 0,
          History: 0,
          Insight: 0,
          Intimidation: 0,
          Investigation: 0,
          Medicine: 0,
          Nature: 0,
          Perception: 0,
          Performance: 0,
          Persuasion: 0,
          Religion: 0,
          'Sleight of Hand': 0,
          Stealth: 0,
          Survival: 0
      },          // Calculated by proficiencies & modifiers
      PassivePerception: null, // wisdom
      Proficiencies: [''],   // Determined by class and race

      ArmorClass: 10, // 10 + Dex Mod, if unarmored. Otherwise use equipment list
      Initiative: 1, // Determined by class
      Speed: 30, // Determined by Race
      HitPointMax: 0,  // Determined by Con mod & class
      CurrentHitPoints: 0,
      TemporaryHitPoints: 0,   // These deplete over time?
      Attacks: [''],  // Determined by class? And equipement. Pre-populate with the generic actions
      Spells: [''], // List of prepared spells. The edit modal lists all available spells?
      Wealth: {
          cp: 0,
          sp: 0,
          ep: 0,
          gp: 0,
          pp: 0
      },
      Equipment: [''], // Lists items that the player has equipped

      PersonalityTraits: '',
      Ideals: '',
      Bonds: '',
      Flaws: '',
      Feats: [''],  // mostly determined by class? also race?
  });

  const navigate = useNavigate();

  const register = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    axios.post('/api/register', {
      username: username,
      password: password,
      character: character,
      CampaignID: 1,  // Defaults to Adventures in Neverwinter
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
        <input
          type="text"
          placeholder="Character Name"
          value={character.Name}
          onChange={e => setCharacter(prevCharacter =>
          ({ ...prevCharacter,
          Name: e.target.value }))} />
        <button type="submit">Register</button>
      </form>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      <Link to="/login">Log In</Link>
    </div>
  );
}

export default Register;