import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { Table, Container, Row, Col, Alert, Button } from 'react-bootstrap';
import { Spinner } from 'react-bootstrap';

import UserContext from './UserContext'; // import the context
import Login from './Login';
import Register from './Register';

import Menu from './Menu';

import DMTools from './DMTools';
import CharacterSheet from './CharacterSheet';
import InventoryView from './InventoryView';
// import Spellbook from './Spellbook';
import Journal from './Journal';
import Library from './Library';
import AccountProfile from './AccountProfile';

import Chat from './Chat';


import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';


function App() {
  const [userID, setUserID] = useState(null);
  const [username, setUsername] = useState(null);

  // Socket Stuff
  const [socket, setSocket] = useState(null);
  const [socketLoading, setSocketLoading] = useState(true);
  const [token, setToken] = useState(null);

  // State variables from useAuthHandler
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState({ id: null, name: null, dmId: null, ownerId: null });
  const [characterName, setCharacterName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [headers, setHeaders] = useState({});

  useEffect(() => {
    console.log('headers:', headers);
  }, [headers]);

  const [inCombat, setInCombat] = useState(false);

  function authenticateUserWithToken(token) {
    console.log("Authenticating with token:", token);
    setIsLoading(true); // Set loading to true when starting authentication
    axios.post('http://127.0.0.1:5001/api/verify', { token: token })
      .then(response => {
        console.log("Response from verify:", response.data);
        if (response.data.success) {
          console.log("Token is valid");
          setIsLoggedIn(true);
          // Store the token in local storage
          localStorage.setItem('token', token);
          // Fetch user data here
          axios.get('http://127.0.0.1:5001/api/profile', { headers: { Authorization: `Bearer ${token}` } })
            .then(response => {
              console.log("User data:", response.data);
              setUsername(response.data.username);
              setUserID(response.data.id); // Set the userID
              setIsLoading(false); // Set loading to false when user data has been fetched

              // Update headers with user ID
              setHeaders(prevHeaders => ({
                ...prevHeaders, // Spread the previous headers to ensure we don't overwrite any existing properties
                'User-ID': response.data.id
              }));
            })
            .catch(error => {
              console.error(error);
              setIsLoading(false); // Set loading to false if there was an error fetching user data
            });
        }
        setIsLoading(false); // Set loading to false if the token was invalid
      })
      .catch(error => {
        console.error(error);
        localStorage.removeItem('token'); // Remove invalid token
        if (error.response && error.response.status === 401) {
          console.log("Unauthorized request");
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
  

  // Emit user_connected after user is authenticated and socket is established
  useEffect(() => {
    if (isLoggedIn && socket) {
        socket.emit('user_connected', { username });
    }
  }, [isLoggedIn, socket, username]);


  // Update the useEffect that updates the headers
  useEffect(() => {
    console.log("Updating Headers")
    const token = localStorage.getItem('token');

    if (token) {
      setHeaders(prevHeaders => ({
        ...prevHeaders, // Spread the previous headers to ensure we don't overwrite any existing properties
        Authorization: `Bearer ${token}`
      }));
    }
  }, [token]);

  // Web Socket stuff
  useEffect(() => {
    if (!token) return;

    setSocketLoading(true);
    const newSocket = io('/', { query: { token } });
    setSocket(newSocket);
    setSocketLoading(false);

    newSocket.on('connect_error', (error) => {
        console.error("Socket Connection Error:", error);
    });

    return () => newSocket.close();
  }, [token]);


  useEffect(() => {
    if (!socket) return;

    const handleTurnUpdate = ({ current, next }) => {
      setCurrentTurn(current.order)
      setTurnInfo(prevState => ({
        ...prevState,
        current: current,
        next: next
      }));
    };

    const handleEndOfCombat = () => {
      setInCombat(false);
    };

    const updateCombatants = (combatants) => {
      console.log("Updated Combatants List received");
      setCombatants(combatants);

      let yourSpot = combatants.findIndex(combatant => combatant.characterName === characterName) + 1;

      // Check if there are enough combatants to determine current and next
      if (combatants.length >= 2) {
        const current = { character: combatants[0], order: 1 };
        const next = { character: combatants[1], order: 2 };
        setTurnInfo({ current, next, yourSpot });
      }

      console.log("combatants:", combatants);
    };

    socket.on('active_users', (active_users) => {
      // console.log('APP- Active users:', active_users);
    });

    socket.on('Roll for initiative!', () => setShow(true));
    socket.on('combatants', updateCombatants);
    socket.on('turn update', handleTurnUpdate);
    socket.on('end of combat', handleEndOfCombat);

    return () => {
      socket.off('token_expired');
      socket.off('active_users');
      socket.off('Roll for initiative!');
      socket.off('combatants', updateCombatants);
      socket.off('turn update', handleTurnUpdate);
      socket.off('end of combat', handleEndOfCombat);
    };
  }, [socket]);


  /***************************/

  /* Iniative Roll Stuff */
  const [initiativeOrder, setInitiativeOrder] = useState(0);  // Player entered
  const [currentTurn, setCurrentTurn] = useState(1);  // Whose turn is it rn?
  const [show, setShow] = useState(false); // Add state for controlling the alert visibility
  const [turnInfo, setTurnInfo] = useState({ current: null, next: null });
  const [combatants, setCombatants] = useState([]);

  const handleInitiativeSubmit = () => {
    // Emit the initiative roll to the server
    socket.emit('initiative roll', { characterName, roll: initiativeOrder });
    setShow(false); // Hide the initiative roll alert after submitting the roll
    setInCombat(true);
  };

  const getTurnInfo = () => {
    const current = combatants[currentTurn];
    const next = combatants[(currentTurn + 1) % combatants.length];
    const yourPlace = combatants.findIndex((combatant) => combatant.characterName === characterName);
    return { current, next, yourPlace };
  };

  return (
    // In your return statement, modify the spinner condition like this:
    
    <UserContext.Provider value={{ characterName, accountType, headers, setIsLoggedIn, socket }}>
      <Router>
        {/* Show the spinner while the token is authenticating */}
        {isLoading && (
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <Spinner animation="border" role="status" />
          </div>
        )}

        {/* Show initiative alert */}
        {show && accountType === 'Player' && (
          <Alert variant="danger" onClose={() => setShow(false)} style={{ position: 'fixed', top: 0, right: 0, zIndex: 1000 }}>
            <Alert.Heading>Roll for Initiative!</Alert.Heading>
            <input
              type="number"
              value={initiativeOrder}
              onChange={(e) => setInitiativeOrder(e.target.value)}
            />
            <Button onClick={handleInitiativeSubmit}>Submit</Button>
          </Alert>
        )}

        {/* Main App Layout */}
        {isLoggedIn ? (
          selectedCampaign.id ? (
            <Container fluid style={{ height: '100vh', width: '100%', overflow: 'auto' }}>
            <Row className="d-none d-md-flex">
              <Col md={2} className="menu-column">
                  <Menu accountType={accountType} selectedCampaign={selectedCampaign} />
              </Col>
              <Col md={8} className="content-column">
                <Routes>
                  <Route path="/" element={<Navigate to="/accountProfile" />} />
                  <Route path="/characterSheet" element={<CharacterSheet headers={headers} characterName={characterName} />} />
                  <Route path="/dmTools" element={<DMTools headers={headers} socket={socket} />} />
                  <Route path="/inventoryView" element={<InventoryView username={username} characterName={characterName} accountType={accountType} headers={headers} socket={socket} isLoading={isLoading} setIsLoading={setIsLoading} />} />
                  {/* <Route path="/Spellbook" element={<Spellbook username={username} characterName={characterName} accountType={accountType} headers={headers} socket={socket} isLoading={isLoading} setIsLoading={setIsLoading} />} /> */}
                  <Route path="/journal" element={<Journal characterName={characterName} headers={headers} isLoading={isLoading} />} />
                  <Route path="/library" element={<Library headers={headers} socket={socket} />} />
                  <Route path="/accountProfile" element={<AccountProfile headers={headers} setSelectedCampaign={setSelectedCampaign} setCharacterName={setCharacterName} setAccountType={setAccountType} />} />
                </Routes>
              </Col>
              <Col md={3} className="chat-column">
                {inCombat && accountType !== 'DM' && turnInfo.current.character.characterName && turnInfo.next.character.characterName && (
                  <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 1000, width: '300px' }}>
                    <Table striped bordered>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Character</th>

                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{turnInfo.current.order}</td>
                          <td>{turnInfo.current.character.characterName}</td>
                        </tr>
                        <tr>
                          <td>{turnInfo.next.order}</td>
                          <td>{turnInfo.next.character.characterName}</td>
                        </tr>
                        <tr>
                          <td>{turnInfo.yourSpot}</td>
                          <td>You</td>
                        </tr>
                      </tbody>
                    </Table>
                  </div>
                )}
                {!socketLoading && <Chat headers={headers} socket={socket} characterName={characterName} username={username} />}
              </Col>
            </Row>
          </Container>
          ) : (
              <AccountProfile headers={headers}
              setSelectedCampaign={setSelectedCampaign}
              setCharacterName={setCharacterName}
              setAccountType={setAccountType} />
          )
        ) : (
          <Container fluid>
            <Routes>
              <Route
                path="/login"
                element={
                  <Login setIsLoggedIn={setIsLoggedIn}
                  setToken={(token) => {setToken(token)}}
                  setUsername={(username) => {setUsername(username)}}
                  setHeaders={(headers) => {setHeaders(headers)}}
                />}
              />
              <Route
                path="/register"
                element={
                  <Register setIsLoggedIn={setIsLoggedIn}
                    setToken={(token) => {setToken(token)}}
                    setUsername={(username) => {setUsername(username)}}
                    setHeaders={(headers) => { setHeaders(headers) }}
                  />}
                />
              <Route path="*" element={<Navigate to="/login" />} /> {/* Default route */}
            </Routes>
          </Container>
        )}
      </Router>
    </UserContext.Provider>
  );
}

export default App;
