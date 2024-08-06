import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Modal, Navbar, Container, Row, Col, Form, Carousel } from 'react-bootstrap';
import campaignIcon from './campaign.webp';

import CreateCharacterModal from './CreateCharacterModal';
import { set } from 'jodit/esm/core/helpers';

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
  
  // Modified to accept a character object instead of a list
  const handleSelectCharacter = (character) => {
    console.log("AccountProfile- selected character:", character);
    setCharacterName(character.name); // Set the character name
    setCharacterID(character.id); // Set the character ID
    setShowModalSelectCharacter(true);
  }

  // Get campaigns for user
  useEffect(() => {
    const fetchData = async () => {
      axios.get('/api/campaigns', { headers })
        .then(response => {
          setCampaigns(response.data)
        })
        .catch(error => {
          console.error('Error fetching campaigns:', error)
        });
      }
    fetchData();
  }, [headers]);

  // Get user's characters
  useEffect(() => {
    axios.get('/api/characters', { headers })
      .then(response => {
        setCharacters(response.data)
      })
      .catch(error => {
        console.error('Error fetching characters:', error)
      });
  }, [headers]);


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

  return (
    <>
      <Container style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', paddingBottom: '50px' }}>
        <Row>
          <h1>Account Profile</h1>
        </Row>
        <Row style={{ flex: '1 1 auto', justifyContent: 'center', alignItems: 'center' }}>
          <Carousel style={{ width: '70vh'}}>
            {campaigns.map((campaign, index) => (
              <Carousel.Item key={campaign.id}>
                <Carousel.Caption>
                  <h3>{campaign.name}</h3>
                  <p>{campaign.system}</p>
                </Carousel.Caption>
                <img
                  className="d-block w-100"
                  src={campaign.icon || campaignIcon}
                  alt={`Campaign ${index}`}
                />
              </Carousel.Item>
            ))}
            {characters.map((character, index) => (
              <Carousel.Item key={character.id}>
                <Carousel.Caption>
                  <h3>{character.name}</h3>
                  <p>{character.Class}</p>
                </Carousel.Caption>
                <img
                  className="d-block w-100"
                  src={process.env.PUBLIC_URL + '/avatars/' + character.icon || campaignIcon}
                  alt={`Character ${index}`}
                />
              </Carousel.Item>
            ))}
          </Carousel>
        </Row>
        <Row style={{ flex: 'none', height: '10px' }}></Row>
        <Row style={{ flex: 'none' }}>
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
        </Row>
        <Row style={{ flex: 'none' }}>
          {characters.map((character) => (
            console.log("AccountProfile: characters-", character),
            <Col sm={4} key={character.id}>
                <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }}>
                <Row>
                  <Col xs={4}>
                    <Card.Img variant="top" src={process.env.PUBLIC_URL + '/avatars/' +  character.icon || campaignIcon} />
                  </Col>
                  <Col xs={8}>
                    <Card.Body>
                      <Card.Title>{character.name}</Card.Title>
                      <Card.Subtitle className="mb-2 text-muted">{character.Class}</Card.Subtitle>
                      {/* Add more details here */}
                    </Card.Body>
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
          <Col sm={4}>
            <Card style={{ width: '18rem', height: '90px', marginBottom: '1rem' }} onClick={handleCreateCharacter}>
              <Row>
                <Col xs={4}>
                  <Card.Img variant="top" src={campaignIcon} />
                </Col>
                <Col xs={8}>
                  <Card.Body>
                    <Card.Title>Create A New Character</Card.Title>
                  </Card.Body>
                </Col>
              </Row>
            </Card>
          </Col>
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
                {/* Add more options here as needed */}
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