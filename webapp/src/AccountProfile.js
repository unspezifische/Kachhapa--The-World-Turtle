import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Modal, Navbar, Container, Row, Col } from 'react-bootstrap';

const AccountProfile = ({ headers, setSelectedCampaign }) => {
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const handleClose = () => setShowModal(false);
  const handleShow = () => setShowModal(true);

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
  }, []);

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
      navigate('/dmTools');
    } else {
      navigate('/characterSheet');
    }
  };

  return (
    <>
      <Container>
        <Row>
          <h1>Account Profile</h1>
        </Row>
        <Row>
          {campaigns.map((campaign) => (
            <Col sm={4} key={campaign.id}>
              <Card style={{ width: '18rem', marginBottom: '1rem' }} onClick={() => handleCampaignSelection(campaign)}>
                <Card.Img variant="top" src={campaign.icon} />
                <Card.Body>
                  <Card.Title>{campaign.name}</Card.Title>
                </Card.Body>
              </Card>
            </Col>
          ))}
          <Col sm={4}>
            <Card style={{ width: '18rem', marginBottom: '1rem' }} onClick={handleShow}>
              <Card.Body>
                <Card.Title>Create New Campaign</Card.Title>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      <Modal show={showModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Create New Campaign</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Add form fields for creating a new campaign here */}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default AccountProfile;