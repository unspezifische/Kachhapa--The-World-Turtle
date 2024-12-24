import React, { useEffect, useState, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
// import axios from 'axios';
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
  const SOCKET_URL = window.location.hostname === 'localhost' ? 'ws://localhost' : 'ws://app.raspberrypi.local';

  const [token, setToken] = useState(localStorage.getItem('token') || '');

  const [username, setUsername] = useState('');
  const [userID, setUserID] = useState(null);
  const [characterName, setCharacterName] = useState('');
  const [characterID, setCharacterID] = useState(null);
  const [accountType, setAccountType] = useState('');


  // // Debugging
  // useEffect(() => {
  //   console.log('characterName:', characterName);
  // }, [characterName]);

  // useEffect(() => {
  //   console.log('headers:', headers);
  // }, [headers]);

  // State variables from useAuthHandler
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState({ id: null, name: null, dmId: null, ownerId: null });

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'userID': userID,
    'username': username,
    'characterID': characterID,
    'campaignID': selectedCampaign.id,
  }), [token, userID, username, selectedCampaign, characterID]);

  // Socket Stuff
  const socketRef = useRef(null);
  const [socketLoading, setSocketLoading] = useState(true);

  const [inCombat, setInCombat] = useState(false);


  // Web Socket setup and maintance
  useEffect(() => {
    if (!token) return;

    setSocketLoading(true);
    console.log("Creating new socket connection");

    const newSocket = io(SOCKET_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      query: { token, campaignID: selectedCampaign.id },
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });
    
    newSocket.on('connect', () => {
      console.log("Socket Connected");
      socketRef.current = newSocket;
      setSocketLoading(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error("Socket Connection Error:", error);
    });

    newSocket.on('token_expired', () => {
      console.log("Token Expired");
      localStorage.removeItem('token');
      // Handle token expiration clientside?
    });

    newSocket.on('request_campaignID', () => {
      console.log('Server is requesting campaign ID');
      if (selectedCampaign.id) {
        newSocket.emit('send_campaignID', { campaignID: selectedCampaign.id });
      } else {
        // Handle the case where campaignID is not available
        console.error('Campaign ID is not available');
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.warn("Socket Disconnected:", reason);
      if (reason === 'io server disconnect') {
        newSocket.connect();
      }
      else {
        newSocket.emit('user_disconnected', {
          campaign_id: selectedCampaign.id,
          user_id: userID
        });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token, selectedCampaign.id]);

  // Emit join_room event when selectedCampaign changes (which should only occur after the user has already logged in)
  useEffect(() => {
    if (socketRef.current && selectedCampaign.id && username) {
      console.log(`Joining room for campaign ID: ${selectedCampaign.id}`);
      // socketRef.current.join(selectedCampaign.id);
      socketRef.current.emit('join_room', { username, campaign_id: selectedCampaign.id });
    }
  }, [socketRef.current, selectedCampaign.id, username]);

  // Web Socket event listeners for Initative Tracking
  useEffect(() => {
    if (!socketRef.current) return;

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

    socketRef.current.on('active_users', (active_users) => {
      // console.log('APP- Active users:', active_users);
    });

    socketRef.current.on('Roll for initiative!', () => setShow(true));
    socketRef.current.on('combatants', updateCombatants);
    socketRef.current.on('turn update', handleTurnUpdate);
    socketRef.current.on('end of combat', handleEndOfCombat);

    return () => {
      socketRef.current.off('token_expired');
      socketRef.current.off('active_users');
      socketRef.current.off('Roll for initiative!');
      socketRef.current.off('combatants', updateCombatants);
      socketRef.current.off('turn update', handleTurnUpdate);
      socketRef.current.off('end of combat', handleEndOfCombat);
    };
  }, [socketRef.current]);


  /***************************/

  /* Iniative Roll Stuff */
  const [initiativeOrder, setInitiativeOrder] = useState(0);  // Player entered
  const [currentTurn, setCurrentTurn] = useState(1);  // Whose turn is it rn?
  const [show, setShow] = useState(false); // Add state for controlling the alert visibility
  const [turnInfo, setTurnInfo] = useState({ current: null, next: null });
  const [combatants, setCombatants] = useState([]);

  const handleInitiativeSubmit = () => {
    // Emit the initiative roll to the server
    socketRef.current.emit('initiative roll', { characterName, roll: initiativeOrder });
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
    <UserContext.Provider value={{ characterName, accountType, headers, setIsLoggedIn, socket: socketRef.current }}>
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
                  <Menu headers={headers} accountType={accountType} selectedCampaign={selectedCampaign} setSelectedCampaign={setSelectedCampaign} />
              </Col>
              <Col md={8} className="content-column">
                <Routes>
                  <Route path="/" element={<Navigate to="/accountProfile" />} />
                  <Route path="/characterSheet" element={<CharacterSheet headers={headers} characterName={characterName} />} />
                  <Route path="/dmTools" element={<DMTools headers={headers} socket={socketRef.current} />} />
                  <Route path="/inventoryView" element={<InventoryView username={username} characterName={characterName} accountType={accountType} headers={headers} socket={socketRef.current} campaignID={selectedCampaign.id} isLoading={isLoading} setIsLoading={setIsLoading} />} />
                  {/* <Route path="/Spellbook" element={<Spellbook username={username} characterName={characterName} accountType={accountType} headers={headers} socket={socketRef.current} isLoading={isLoading} setIsLoading={setIsLoading} />} /> */}
                  <Route path="/journal" element={<Journal characterName={characterName} headers={headers} isLoading={isLoading} campaignID={selectedCampaign.id} />} />
                  <Route path="/library" element={<Library headers={headers} socket={socketRef.current} />} />
                  <Route path="/accountProfile" element={<AccountProfile headers={headers} selectedCampaign={selectedCampaign} setSelectedCampaign={setSelectedCampaign} setCharacterName={setCharacterName} setAccountType={setAccountType} setCharacterID={setCharacterID} socket={socketRef.current} />} />

                  {/* Catch-all route for wiki pages */}
                  <Route path="/:campaign_name/:page_title" render={({ match }) => {
                    const { campaign_name, page_title } = match.params;
                    window.location.href = `/${campaign_name}/${page_title}`;
                    return null;
                  }} />
                  {/* Allow access to the server admin and monitoring dashboards */}
                  <Route path="/admin" component={() => { window.location.href = '/admin'; return null; }} />
                  <Route path="/dashboard" component={() => { window.location.href = '/dashboard'; return null; }} />
                </Routes>
              </Col>
              <Col md={3} className="chat-column">
                {inCombat && accountType !== 'DM' && turnInfo.current.character.characterName && turnInfo.next.character.characterName && (
                  // <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 1000, width: '300px' }}>
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
                  // </div>
                )}
                  {!socketLoading && <Chat
                    headers={headers}
                    socket={socketRef.current}
                    characterName={characterName}
                    username={username}
                    campaignID={selectedCampaign.id} />}
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
                    setToken={setToken}
                    setUserID={setUserID}
                    setIsLoading={setIsLoading}
                    setAppUsername={setUsername}
                />}
              />
              <Route
                path="/register"
                element={
                  <Register setIsLoggedIn={setIsLoggedIn}
                    setToken={setToken}
                    setAppUsername={setUsername}
                    setUserID={setUserID}
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
