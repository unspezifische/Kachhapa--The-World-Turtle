import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Modal, Navbar, Container, Row, Col, Form, Carousel, Accordion } from 'react-bootstrap';
import campaignIcon from './campaign.webp';

import CreateCharacterModal from './CreateCharacterModal';

const AccountProfile = ({ headers, setSelectedCampaign, setCharacterName, setAccountType, setCharacterID }) => {
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [unaffiliatedCharacters, setUnaffiliatedCharacters] = useState([]);

  const [showModalCampaign, setShowModalCampaign] = useState(false);
  const [showModalCharacter, setShowModalCharacter] = useState(false);
  const [showModalSelectCharacter, setShowModalSelectCharacter] = useState(false);

  const handleCloseModalCampaign = () => setShowModalCampaign(false);
  const handleCreateCampaign = () => setShowModalCampaign(true);

  const handleCloseModalCharacter = () => setShowModalCharacter(false);
  const handleCreateCharacter = () => setShowModalCharacter(true);

  const handleCloseModalSelectCharacter = () => setShowModalSelectCharacter(false);

  // Get camapigns and characters
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [campaignsResponse, charactersResponse] = await Promise.all([
          axios.get('/api/campaigns', { headers }),
          axios.get('/api/characters', { headers })
        ]);

        setCampaigns(campaignsResponse.data);
        setCharacters(charactersResponse.data);

        console.log("AccountProfile- api/characters:", charactersResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [headers]);

  // Modified to accept a character object instead of a list
  const handleSelectCharacter = (character) => {
    if (character) {
      console.log("AccountProfile- selected character:", character);
      setAccountType('Player');
      setCharacterName(character.name); // Set the character name
      setSelectedCampaign(character.campaign);
      setCharacterID(character.id); // Set the character ID
      // setShowModalSelectCharacter(true);
      navigate('/characterSheet');
    } else {
      console.log("Profile- no character selected");
    }
  };

  const handleCampaignSelection = (campaign) => {
    console.log("header- AccountProfile", headers);
    // Add the Campaign-ID to the headers
    headers['Campaign-ID'] = campaign.id;
    setSelectedCampaign({
      id: campaign.id,
      name: campaign.name,
      dmId: campaign.dm_id,
      ownerId: campaign.owner_id
    });
    if (campaign.dm_id === headers.userID) {
      axios.get('/api/characters', { headers })
        .then(response => {
          console.log("AccountProfile- api/characters:", response.data);
        })
      setAccountType('DM');
      setCharacterName('DM');
      navigate('/dmTools');
    } 
    else if (campaign.owner_id === headers.userID) {
      axios.get('/api/characters', { headers })
        .then(response => {
          console.log("AccountProfile- api/characters:", response.data);
        })
      setAccountType('DM');
      setCharacterName('Admin');
      navigate('/dmTools');
    } else {
      setAccountType('Player');
      axios.get('/api/characters', { headers })
        .then(response => {
          // console.log("AccountProfile- api/characters:", response.data);
          // Filter the user's characters for those that are affiliated with the selected campaign
          const affiliatedCharacters = response.data.filter(character => character.campaignID === campaign.id);
          console.log("affiliatedCharacters:", affiliatedCharacters);
          if (affiliatedCharacters.length > 0) {
            console.log("Selected Character-", affiliatedCharacters[0]);
            console.log("Selected Character ID-", affiliatedCharacters[0].id);
            console.log("Selected Character Name-", affiliatedCharacters[0].name);
            setCharacterName(affiliatedCharacters[0].name);
            // setCharacterID(affiliatedCharacters[0].id);
            navigate('/characterSheet');
          } else {
            // If no such characters exist, proceed with the existing logic to handle unaffiliated characters
            setUnaffiliatedCharacters = response.data.characters.filter(character => !character.campaignID && character.system === campaign.system);
            if (unaffiliatedCharacters.length > 0) {
              handleSelectCharacter(unaffiliatedCharacters);
            } else {
              handleCreateCharacter();
            }
          }
        })
        .catch(error => {
          console.error('Error fetching profile:', error);
        });
    }

  };

  const handleWikiSelection = (campaign) => {
    console.log("header- AccountProfile", headers);
    // Add the Campaign-ID to the headers
    headers['Campaign-ID'] = campaign.id;
    setSelectedCampaign({
      id: campaign.id,
      name: campaign.name,
      dmId: campaign.dm_id,
      ownerId: campaign.owner_id
    });

    console.log("opening wiki for", campaign.name);

    if (campaign.dm_id === headers.userID) {
      axios.get('/api/characters', { headers })
        .then(response => {
          console.log("AccountProfile- api/characters:", response.data);
        })
      setAccountType('DM');
      setCharacterName('DM');
      navigate('/dmTools');
    }
    else if (campaign.owner_id === headers.userID) {
      axios.get('/api/characters', { headers })
        .then(response => {
          console.log("AccountProfile- api/characters:", response.data);
        })
      setAccountType('DM');
      setCharacterName('Admin');
      navigate('/dmTools');
    } else {
      setAccountType('Player');
      axios.get('/api/characters', { headers })
        .then(response => {
          // console.log("AccountProfile- api/characters:", response.data);
          // Filter the user's characters for those that are affiliated with the selected campaign
          const affiliatedCharacters = response.data.filter(character => character.campaignID === campaign.id);
          console.log("affiliatedCharacters:", affiliatedCharacters);
          if (affiliatedCharacters.length > 0) {
            console.log("Selected Character-", affiliatedCharacters[0]);
            console.log("Selected Character ID-", affiliatedCharacters[0].id);
            console.log("Selected Character Name-", affiliatedCharacters[0].name);
            setCharacterName(affiliatedCharacters[0].name);
            navigate('/characterSheet');
          } else {
            // If no such characters exist, proceed with the existing logic to handle unaffiliated characters
            setUnaffiliatedCharacters = response.data.characters.filter(character => !character.campaignID && character.system === campaign.system);
            if (unaffiliatedCharacters.length > 0) {
              handleSelectCharacter(unaffiliatedCharacters);
            } else {
              handleCreateCharacter();
            }
          }
        })
        .catch(error => {
          console.error('Error fetching profile:', error);
        });
    }

    // Store headers in local storage
    localStorage.setItem('userID', headers['userID']);
    localStorage.setItem('characterName', headers['characterName']);
    console.log("Stored header in local storage");

    // Construct the destination URL without encoding
    var destinationURL = 'http://raspberrypi.local/' + encodeURIComponent(campaign.name) + "/Main Page";
    var destinationPage = encodeURIComponent(campaign.name) + "/Main Page";
    console.log("Destination URL: " + destinationURL);
    console.log("Destination Page: " + destinationPage);

    // Encode the entire destination URL
    var encodedDestination = encodeURIComponent(destinationPage);
    console.log("Encoded URL: " + encodedDestination);

    // Include the encoded destination URL as a query parameter in the login URL
    var loginUrl = 'http://raspberrypi.local/login?redirect=/wiki/' + encodedDestination;
    console.log("URL with Redirect: " + loginUrl);

    // Open the login URL in a new window
    window.open(loginUrl, '_blank');
  };

  const [newCampaign, setNewCampaign] = useState({
    name: '',
    system: 'D&D',
    module: '',
    description: ''
  });

  const [newCharacter, setNewCharacter] = useState({
    name: '',
    system: 'D&D',
    class: ''
  });

  const handleInputChange = (event) => {
    setNewCampaign({
      ...newCampaign,
      [event.target.name]: event.target.value
    });
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    axios.post('/api/campaigns', newCampaign, { headers })
      .then(response => {
        setCampaigns([...campaigns, response.data]);
        handleCloseModalCampaign();
      })
      .catch(error => {
        console.error('Error creating campaign:', error);
      });
  };

  // For the Carousel: className='d-flex flex-column align-items-center'
  return (
    <>
      <Container fluid>
        <Row>
          <h1>Account Profile</h1>
        </Row>
        {/* Carousel */}
        <Row >
          <Carousel>
            {campaigns.map((campaign, index) => (
              <Carousel.Item key={campaign.id}>
                <Carousel.Caption>
                  <h3 style={{ mixBlendMode: 'difference', color: 'red' }}>{campaign.name}</h3>
                  <p style={{ mixBlendMode: 'difference', color: 'red' }}>{campaign.system}</p>
                </Carousel.Caption>
                <img
                  className="d-flex justify-content-center align-items-center"
                  style={{height: '40vh', margin: '0 auto' }}
                  src={campaign.icon || campaignIcon}
                  alt={`Campaign ${index}`}
                />
              </Carousel.Item>
            ))}
            {characters.map((character, index) => (
              <Carousel.Item key={character.id}>
                <Carousel.Caption>
                  <h3 style={{ mixBlendMode: 'difference', color: 'red' }}>{character.name}</h3>
                  <p style={{ mixBlendMode: 'difference', color: 'red' }}>{character.Class}</p>
                  <p style={{ mixBlendMode: 'difference', color: 'red' }}>{character.campaign}</p>
                </Carousel.Caption>
                <img
                  className="d-flex justify-content-center align-items-center"
                  style={{height: '40vh', margin: '0 auto' }}
                  src={process.env.PUBLIC_URL + '/avatars/' + character.icon || campaignIcon}
                  alt={`Character ${index}`}
                />
              </Carousel.Item>
            ))}
          </Carousel>
        </Row>

        {/* Campaigns, Characters, and Wikis */}
        <Row>
          <Accordion defaultActiveKey="0">
            {/* Campaigns */}
            <Accordion.Item eventKey="0">
              <Accordion.Header>
                <h3>My Campaigns</h3>
              </Accordion.Header>
              <Accordion.Body>
                {campaigns.map((campaign) => (
                  <Col sm={4} key={campaign.id}>
                    <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }} onClick={() => handleCampaignSelection(campaign)}>
                      <Row>
                        <Col xs={4}>
                          <Card.Img variant="top" src={campaign.icon || campaignIcon} />
                        </Col>
                        <Col xs={8}>
                          <Card.Body>
                            <Card.Title>{campaign.name}</Card.Title>
                            <Card.Subtitle className="mb-2 text-muted">{campaign.system}</Card.Subtitle>
                            {/* Add more details here */}
                          </Card.Body>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                ))}
                <Col sm={4}>
                  <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }} onClick={handleCreateCampaign}>
                    <Row>
                      <Col xs={4}>
                        <Card.Img variant="top" src={campaignIcon} />
                      </Col>
                      <Col xs={8}>
                        <Card.Body>
                          <Card.Title>Create A New Campaign</Card.Title>
                        </Card.Body>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Accordion.Body>
            </Accordion.Item>
            {/* Characters */}
            <Accordion.Item eventKey="1">
              <Accordion.Header>
                <h3>My Characters</h3>
              </Accordion.Header>
              <Accordion.Body>
                {characters.map((character) => (
                  <Card
                    key={character.id}
                    style={{ width: '18rem', height: '90px', marginBottom: '1rem' }}
                    onClick={() => handleSelectCharacter(character)}
                  >
                    <Row>
                      <Col xs={4}>
                        <Card.Img variant="top" src={character.icon} />
                      </Col>
                      <Col xs={8}>
                        <Card.Body>
                          <Card.Title>{character.name}</Card.Title>
                        </Card.Body>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Col sm={4}>
                  <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }} onClick={handleCreateCharacter}>
                    <Row>
                      <Col xs={4}>
                        <Card.Img fluid src={campaignIcon} />
                      </Col>
                      <Col xs={8}>
                        <Card.Body>
                          <Card.Title>Create A New Character</Card.Title>
                        </Card.Body>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Accordion.Body>
            </Accordion.Item>
            {/* Wikis */}
            <Accordion.Item eventKey="2">
              <Accordion.Header>
                <h3>Campaign Wikis</h3>
              </Accordion.Header>
              <Accordion.Body>
                {campaigns.map((campaign) => (
                  <Col sm={4} key={campaign.id}>
                    <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }} onClick={() => handleWikiSelection(campaign)}>
                      <Row>
                        <Col xs={4}>
                          <Card.Img variant="top" src={campaign.icon || campaignIcon} />
                        </Col>
                        <Col xs={8}>
                          <Card.Body>
                            <Card.Title>{campaign.name}</Card.Title>
                            <Card.Subtitle className="mb-2 text-muted">{campaign.system}</Card.Subtitle>
                            {/* Add more details here */}
                          </Card.Body>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                ))}
                <Col sm={4}>
                  <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }} onClick={handleCreateCampaign}>
                    <Row>
                      <Col xs={4}>
                        <Card.Img variant="top" src={campaignIcon} />
                      </Col>
                      <Col xs={8}>
                        <Card.Body>
                          <Card.Title>Create A New Campaign</Card.Title>
                        </Card.Body>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Row>
      </Container>

      {/* Select Character Modal */}
      <Modal show={showModalSelectCharacter} onHide={handleCloseModalSelectCharacter}>
        <Modal.Header closeButton>
          <Modal.Title>Select Character</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="characterSelect">
              <Form.Label>Character</Form.Label>
              <Form.Control as="select" name="character" onChange={handleInputChange} required>
                <option value="">Select a character</option>
                {unaffiliatedCharacters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </Form.Control>
            </Form.Group>
            <Button variant="primary" type="submit">Select Character</Button>
          </Form>
        </Modal.Body>
      </Modal>

      {/* Campaign Creation Modal */}
      <Modal show={showModalCampaign} onHide={handleCloseModalCampaign}>
        <Modal.Header closeButton>
          <Modal.Title>Create New Campaign</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleFormSubmit}>
            <Form.Group controlId="campaignName">
              <Form.Label>Campaign Name</Form.Label>
              <Form.Control type="text" name="name" value={newCampaign.name} onChange={handleInputChange} required />
            </Form.Group>
            <Form.Group controlId="campaignSystem">
              <Form.Label>System</Form.Label>
              <Form.Control as="select" name="system" value={newCampaign.system} onChange={handleInputChange} required>
                <option>D&D</option>
                {/* Add more options here as needed */}
              </Form.Control>
            </Form.Group>
            <Form.Group controlId="campaignModule">
              <Form.Label>Module</Form.Label>
              <Form.Control as="select" name="module" value={newCampaign.module} onChange={handleInputChange} >
                <option value="">Select a module (optional)</option>
                <option>Lost Mine of Phandelver</option>
                <option>Waterdeep Dragon Heist</option>
                {/* TODO- Add more options here as needed. And probably populate this based on "Module" in the "game_element" table of the database */}
                {/* TODO TODO- create JSON files for modules */}
              </Form.Control>
            </Form.Group>
            <Form.Group controlId="campaignDescription">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" name="description" value={newCampaign.description} onChange={handleInputChange} />
            </Form.Group>
            <Button variant="primary" type="submit">Create Campaign</Button>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModalCampaign}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Character Creation Modal */}
      <CreateCharacterModal show={showModalCharacter} setShow={setShowModalCharacter} onHide={handleCloseModalCharacter} headers={headers} />
    </>
  );
};

export default AccountProfile;