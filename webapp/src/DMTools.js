import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Form, ListGroup } from 'react-bootstrap';
import { Table, InputGroup, FormControl } from 'react-bootstrap';
import { Container, Row, Col } from 'react-bootstrap';

import axios from 'axios';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

function DMTools({ headers, socket, characterName, accountType }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (accountType === 'player') {
      navigate('/profile');
    }
  }, [accountType, navigate]);

  const [lootBoxes, setLootBoxes] = useState([]);
  const [currentContent, setCurrentContent] = useState('lootBoxes'); // State to control what to display in the second Col

  // Define a function to fetch players
  const fetchPlayers = useCallback(async () => {
    console.log('fetchPlayers called');
    try {
      const response = await axios.get('/api/players', { headers: headers });
      console.log('DM TOOLS- players:', response.data.players);
      setPlayers(response.data.players);
    } catch (error) {
      console.error('Failed to fetch players:', error.response.data);
    }
  }, [headers]);

  // Define a function to fetch loot boxes
  const fetchLootBoxes = useCallback(async () => {
    try {
      const response = await axios.get('/api/lootboxes', { headers: headers });
      // console.log('DM TOOLS- loot boxes:', response.data.lootBoxes);
      setLootBoxes(response.data.lootBoxes);
    } catch (error) {
      console.error('Failed to fetch loot boxes:', error.response.data);
    }
  }, [headers]);

  // Fetch lootboxes when the component mounts
  useEffect(() => {
    fetchLootBoxes();
  }, [fetchLootBoxes]);

  const [lootBoxModalOpen, setLootBoxModalOpen] = useState(false);
  const [lootBoxName, setLootBoxName] = useState('');
  const [items, setItems] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);

  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedLootBox, setSelectedLootBox] = useState({ items: [] });
  const [viewLootBoxModal, setViewLootBoxModal] = useState(false);
  const [editingLootBoxId, setEditingLootBoxId] = useState(null);

  const [inventory, setInventory] = useState([]);
  const [viewPlayerInventoryModal, setViewPlayerInventoryModal] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [combatants, setCombatants] = useState([]);

  // Loot Box Functions
  const handleCreateLootBoxs = () => {
    axios
      .get('/api/items', { headers: headers })
      .then(response => {
        console.log('Items from API:', response.data.items);
        setItems(response.data.items);
      })
      .catch(error => console.error('Error fetching items:', error));
    setLootBoxModalOpen(true);
  };

  const handleItemClick = item => {
    setSelectedItems(prevItems => [...prevItems, { ...item, quantity: 1 }]);
  };

  const handleItemQuantityChange = (itemId, quantity) => {
    setSelectedItems(prevItems => {
      const newItems = [...prevItems];
      const itemIndex = newItems.findIndex(item => item.id === itemId);
      newItems[itemIndex].quantity = quantity;
      return newItems;
    });
  };

  const handleItemSearchChange = e => {
    setSearchText(e.target.value);
  };

  const handleItemRemoveClick = item => {
    setSelectedItems(prevItems => prevItems.filter(i => i.id !== item.id));
  };

  const handleLootBoxClick = lootBox => {
    fetchPlayers();
    setSelectedItems(lootBox.items);
    setLootBoxName(lootBox.name);
    setEditingLootBoxId(lootBox.id); // Remember which loot box we are editing
    setLootBoxModalOpen(true);
  };

  const handleSaveLootBox = () => {
    const items = selectedItems.map(item => ({ id: item.id, quantity: item.quantity }));

    if (editingLootBoxId === null) {
      // If we are not currently editing a loot box, create a new one
      axios
        .post('/api/lootboxes', { name: lootBoxName, items: items }, { headers: headers })
        .then(response => {
          console.log(response.data.message);
          setLootBoxModalOpen(false);
          setLootBoxName('');
          setSelectedItems([]);
          fetchLootBoxes(); // Fetch the updated list of loot boxes
        })
        .catch(error => console.error('Error saving loot box:', error));
    } else {
      // If we are editing a loot box, update it
      axios
        .put(`/api/lootboxes/${editingLootBoxId}`, { name: lootBoxName, items: items }, { headers: headers })
        .then(response => {
          console.log(response.data.message);
          setLootBoxModalOpen(false);
          setLootBoxName('');
          setSelectedItems([]);
          setEditingLootBoxId(null); // Clear the editing state
          fetchLootBoxes(); // Fetch the updated list of loot boxes
        })
        .catch(error => console.error('Error updating loot box:', error));
    }
  };

  const viewLootBox = lootBox => {
    fetchPlayers();
    axios
      .get(`/api/lootboxes/${lootBox.id}`, { headers: headers })
      .then(response => {
        console.log('Opening LootBox:', response.data.items);
        const items = response.data.items;
        setSelectedLootBox({ ...lootBox, items: items });
        setViewLootBoxModal(true);
      })
      .catch(error => console.error('Error fetching loot box items:', error));
  };

  const editLootBox = () => {
    setLootBoxName(selectedLootBox.name); // Add this line
    setSelectedItems(selectedLootBox.items); // Add this line
    setEditingLootBoxId(selectedLootBox.id); // So we can update an existing loot box
    setLootBoxModalOpen(true);
    setViewLootBoxModal(false);
  };

  const deleteLootBox = lootBox => {
    // axios.delete(`/api/lootboxes/${lootBox.id}`, { headers: headers })
    axios.delete(`/api/lootboxes/${lootBox.id}`)
    .then(response => {
      console.log(response.data.message);
      fetchLootBoxes(); // Fetch the updated list of loot boxes
    })
    .catch(error => console.error('Error deleting loot box:', error))
    .finally(setViewLootBoxModal(false));
  }

  const issueLootToPlayer = lootBox => {
    // Issue items via API call to /api/lootboxes/<int:box_id>
    // axios.post(`/api/lootboxes/${lootBox.id}`, { player: selectedPlayer }, { headers: headers })
    axios.post(`/api/lootboxes/${lootBox.id}`, { player: selectedPlayer })
    .then(response => {
      console.log(response.data.message);
      setSelectedPlayer(null); // Clear the selected player
      fetchLootBoxes(); // Fetch the updated list of loot boxes
    })
    .catch(error => console.error('Error issuing loot box:', error))
    .finally(setViewLootBoxModal(false));
  };

  // Navigate to Maps page
  const handleSettlementManagerClick = () => {
    window.location.href = 'http://maps.raspberrypi.local';
  };

  // View Player Inventories
  const handleViewPlayerInventories = () => {
    setCurrentContent('playerInventories'); // Set the state to show player inventories
    fetchPlayers();
  };

  const viewPlayerInventory = player => {
    // API call to get player's inventory
    axios.get('/api/inventory', {
      headers: {
        ...headers,
        'Character-Name': player.character_name, // Include the character name in the request headers
        'Character-ID': player.id
      }})
      .then(response => {
        console.log("Getting inventory for " + player.character_name);
        setInventory(response.data.inventory);
        setSelectedPlayer(player);
        setViewPlayerInventoryModal(true);
      })
      .catch(error => console.error('Error fetching inventory:', error));
  }

  // Initiative Tracker
  const [newEntry, setNewEntry] = useState({ characterName: '', initiative: '' });  // State for new entry

  // Handle input changes for new entry
  const handleNewEntryChange = (field, value) => {
    setNewEntry(prevEntry => ({ ...prevEntry, [field]: value }));
  };

  // Handle submission of new entry
  const handleNewEntrySubmit = () => {
    setCombatants(prevCombatants => {
      return [...prevCombatants, newEntry]
        .sort((a, b) => b.initiative - a.initiative); // Sort in descending order of initiative
    });
    // Clear the new entry fields
    setNewEntry({ characterName: '', initiative: '' });
  };

  useEffect(() => {
    // setCombatants([]) // Will this ensure the list is clear when initiative starts?

    const handleInitiativeRoll = ({ characterName, roll }) => {
      console.log("characterName - roll:", characterName + "-" + roll);
      setCombatants((prevCombatants) =>
        [...prevCombatants, { characterName, initiative: roll }]
        .sort((a, b) => b.initiative - a.initiative) // Sort in descending order of initiative
      );
    };

    socket.on('initiative roll', handleInitiativeRoll);

    return () => {
      socket.off('initiative roll', handleInitiativeRoll);
    };
  }, [socket]);

  useEffect(() => {
    socket.emit('combatants', combatants);
    console.log("combatants:", combatants);
  }, [combatants])

  const handleInitiative = () => {
    // 1. Send message to players that they should roll for initiative
    // 2. Listen for responses containing results of rolls
    // 3. Display results in a table. "Next" button in footer.
    // 4. Options to add missing players and NPCs (for now, just enter name and initiative roll)
    // fetchPlayers();
    setCurrentContent('initiative');
    socket.emit("Roll for initiative!")

    // setCombatants(players); // Add players to the list of combatants
  };

  const handleNextButtonClick = () => {
    const nextTurn = (currentTurn + 1) % combatants.length;
    console.log("nextTurn:", nextTurn);
    setCurrentTurn(nextTurn); // Circular increment
    const current = { character: combatants[currentTurn], order: currentTurn + 1 };
    console.log("current turn:", current.character);
    const next = { character: combatants[nextTurn], order: nextTurn + 1 };
    console.log("Up Next:", next.character);
    // Emit a message to all players with the current and next turn info
    socket.emit('update turn', { current, next });
    console.log("Socket Event Triggered");
  };

  const handleEndOfCombat = () => {
    setCombatants([]); // Reset the combatants
    setCurrentTurn(0); // Reset the current turn
    setCurrentContent('lootBoxes'); // Or any other content you'd like to display
    socket.emit('end of combat'); // Notify players
  };

  // Future Expansion
  const handleNPCCards = () => {
    navigate('/journal');
  };

  const handleBuildEncounter = () => {
    navigate('/library');
  };

  const handleTransactionHistory = () => {
    navigate('/dmTools');
  };

  return (
    <>
      <Container>
        <Row>
          <Col>
            <h1>DM Tools</h1>
            <div class="btn-group-vertical">
              <Button onClick={handleSettlementManagerClick}>Settlement Manager</Button>
              <Button onClick={handleCreateLootBoxs}>Create Loot Boxs</Button>
              {/* Other DM tools */}
              <Button onClick={handleViewPlayerInventories}>View player inventories</Button>
              <Button onClick={handleInitiative}>Roll for Initiative</Button>
              <Button onClick={handleNPCCards}>NPC cards</Button>
              <Button onClick={handleBuildEncounter}>Build Encounter</Button>
              <Button onClick={handleTransactionHistory}>Transaction History</Button>
            </div>
          </Col>
          <Col>
            {currentContent === 'lootBoxes' && (
              <>
                <h2>View and Edit Loot Boxes</h2>
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lootBoxes.map((lootBox, i) => (
                      <tr key={i}>
                        <td>{lootBox.name}</td>
                        <td>
                          <Button variant="primary" onClick={() => viewLootBox(lootBox)}>
                            Examine
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
            {currentContent === 'playerInventories' && (
              <>
                <h2>Player Inventories</h2>
                <Table striped bordered>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.filter(player => player.id !== null).map((player, i) => (
                      <tr key={i}>
                        <td>{player.character_name}</td>
                        <td>
                          <Button variant="primary" onClick={() => viewPlayerInventory(player)}>
                            Examine
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
            {currentContent === 'initiative' && (
              <>
                <h2>Initiative</h2>
                <Table bordered
                >
                  <thead>
                    <tr>
                      <th>Initiative</th>
                      <th>Character</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combatants.map((player, i) => (
                      <tr key={i} className={i === currentTurn ? 'table-warning' : ''}>
                        <td>{player.initiative}</td>
                        <td>{player.characterName}</td>
                      </tr>
                    ))}
                    {/* New Entry Row */}
                    <tr>
                      <td>
                        <input
                          type="number"
                          value={newEntry.initiative}
                          onChange={e => handleNewEntryChange('initiative', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={newEntry.characterName}
                          onChange={e => handleNewEntryChange('characterName', e.target.value)}
                        />
                        <Button onClick={handleNewEntrySubmit}>Add</Button>
                      </td>
                    </tr>
                  </tbody>
                </Table>
                <Button onClick={handleNextButtonClick}>Next</Button>
                <Button variant="danger" onClick={handleEndOfCombat}>End of Combat</Button> {/* End of Combat button */}

              </>
            )}
          </Col>
        </Row>
      </Container>

      {/* Create Loot Box Modal */}
      <Modal show={lootBoxModalOpen} onHide={() => setLootBoxModalOpen(false)} centered fullscreen>
        <Modal.Header closeButton>
          <Modal.Title>Create Loot Box</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            <Col>
              <InputGroup className="mb-3">
                <FormControl
                  placeholder="Search for items"
                  value={searchText}
                  onChange={handleItemSearchChange}
                />
              </InputGroup>
              <Table striped bordered hover>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Add</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(item => item.name.toLowerCase().includes(searchText.toLowerCase())).map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>
                        <Button variant="primary" onClick={() => handleItemClick(item)}>Add</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Col>
            <Col>
              <label>Loot Box Name:
                <input
                  type="text"
                  placeholder="Loot Box Name"
                  value={lootBoxName}
                  onChange={e => setLootBoxName(e.target.value)}
                />
              </label>
              <Table striped bordered hover>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Quantity</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>
                        <Form.Control
                          type="number"
                          placeholder="Quantity"
                          value={item.quantity}
                          onChange={e => handleItemQuantityChange(item.id, e.target.value)}
                        />
                      </td>
                      <td>
                        <Button variant="danger" onClick={() => handleItemRemoveClick(item)}>Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleSaveLootBox}>Save</Button>
        </Modal.Footer>
      </Modal>

      {/* View Loot Box Modal */}
      <Modal show={viewLootBoxModal} onHide={() => setViewLootBoxModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <Row>
              <Col>
                {selectedLootBox?.name}
              </Col>
              <Col>
                <Button variant="primary" onClick={editLootBox}>
                  <EditIcon />
                </Button>
                <Button variant="danger" onClick={() => deleteLootBox(selectedLootBox)}>
                  <DeleteIcon />
                </Button>
              </Col>
            </Row>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>Name</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {selectedLootBox?.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Form.Control as="select" onChange={e => setSelectedPlayer(e.target.value)}>
            <option value="" disabled selected>Select a player</option>
            {players.map((player, index) => (
              <option key={index} value={player.username}>{player.character_name}</option>
            ))}
          </Form.Control>
          <Button variant="primary" onClick={() => issueLootToPlayer(selectedLootBox)}>
            Issue to Player
          </Button>
        </Modal.Footer>
      </Modal>

      {/* View Player Inventory Modal */}
      <Modal show={viewPlayerInventoryModal} onHide={() => setViewPlayerInventoryModal(false)} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <Row>
            {selectedPlayer?.character_name}
          </Row>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {inventory?.map((item, i) => (
              <tr key={i}>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Modal.Body>
      </Modal>
    </>
  );
}

export default DMTools;
