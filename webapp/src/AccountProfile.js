import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Modal, Navbar, Container, Row, Col, Form, Carousel } from 'react-bootstrap';
import campaignIcon from './campaign.webp';

import CreateCharacterModal from './CreateCharacterModal';

const AccountProfile = ({ headers, setSelectedCampaign, setCharacterName, setAccountType }) => {
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);
  const [characters, setCharacters] = useState([]);

  const [showModalCampaign, setShowModalCampaign] = useState(false);
  const [showModalCharacter, setShowModalCharacter] = useState(false);

  const handleCloseModalCampaign = () => setShowModalCampaign(false);
  const handleCreateCampaign = () => setShowModalCampaign(true);

  const handleCloseModalCharacter = () => setShowModalCharacter(false);
  const handleCreateCharacter = () => setShowModalCharacter(true);

  useEffect(() => {
    const fetchData = async () => {
      axios.get('http://127.0.0.1:5001/api/campaigns', { headers })
        .then(response => {
          setCampaigns(response.data)
        })
        .catch(error => {
          console.error('Error fetching campaigns:', error)
        });
      }
    fetchData();
  }, [headers]);

  useEffect(() => {
    // Fetch characters
    axios.get('http://127.0.0.1:5001/api/characters', { headers })
      .then(response => {
        setCharacters(response.data)
      })
      .catch(error => {
        console.error('Error fetching characters:', error)
      });
  }, [headers]);

  const handleCampaignSelection = (campaign) => {
    // Add the Campaign-ID to the headers
    headers['Campaign-ID'] = campaign.id;
      setSelectedCampaign({
        id: campaign.id,
        name: campaign.name,
        dmId: campaign.dm_id,
        ownerId: campaign.owner_id
      });
    if (campaign.dm_id === headers.userID || campaign.owner_id === headers.userID) {
      setAccountType('DM') 
      navigate('/dmTools');
    } else {
      setAccountType('Player') 
      axios.get('http://127.0.0.1:5001/api/profile', { headers })
        .then(response => {
          if (response.data.character) {
            setCharacterName(response.data.character.name);
            navigate('/characterSheet');
          } else {
            handleCreateCharacter(); // Show the CreateCharacterModal
          }
        })
        .catch(error => {
          console.error('Error fetching profile:', error)
        });
      navigate('/characterSheet');
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
    axios.post('http://127.0.0.1:5001/api/campaigns', newCampaign, { headers })
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
            console.log("character:", character),
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