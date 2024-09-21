import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Form, ListGroup } from 'react-bootstrap';
import { Table, InputGroup, FormControl } from 'react-bootstrap';
import { Container, Row, Col } from 'react-bootstrap';

import axios from 'axios';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const alignments = ['Any Alignment', 'Any Good Alignment', 'Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Any Non-good Alignment'];

const InputFormGroup = ({ label, type, value, onChange, name, placeholder }) => (
  <Form.Group>
    <Form.Label>{label}</Form.Label>
    <Form.Control
      as={type === 'textarea' ? 'textarea' : 'input'}
      rows={type === 'textarea' ? 3 : undefined} // Add rows attribute for textarea
      value={value}
      placeholder={placeholder || ''}  // Adds a placeholder with a default empty string
      onChange={onChange}
      name={name}
    />
  </Form.Group>
);

function DMTools({ headers, socket, characterName, accountType }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (accountType === 'player') {
      navigate('/profile');
    }
  }, [accountType, navigate]);

  const [lootBoxes, setLootBoxes] = useState([]);
  const [currentContent, setCurrentContent] = useState('lootBoxes'); // State to control what to display in the second Col

  const [npcs, setNpcs] = useState([]);
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [npcData, setNpcData] = useState({
    name: '',
    size: '',
    creatureType: '',
    creatureSubtype: '',
    alignment: '',
    ac: '',
    hp: '',
    speed: '',
    strength: '',
    dexterity: '',
    constitution: '',
    intelligence: '',
    wisdom: '',
    charisma: '',
    skills: '',
    senses: '',
    languages: '',
    challenge: '',
    traits: '',
    actions: '',
    description: ''
  });

  const [selectedNpc, setSelectedNpc] = useState(null);

  const [randomTables, setRandomTables] = useState([]);


  // Define a function to fetch players
  const fetchPlayers = () => {
    console.log('fetchPlayers called');

    axios.get('/api/players', { headers: headers })
      .then((response) => {
        console.log('DM TOOLS- players:', response.data.players);
        setPlayers(response.data.players);
      })
      .catch((error) => {
        console.error('Failed to fetch players:', error.response.data);
      });
  };

  // Define a function to fetch loot boxes
  const fetchLootBoxes = () => {
    axios.get('/api/lootboxes', { headers: headers })
      .then((response) => {
        // console.log('DM TOOLS- loot boxes:', response.data.lootBoxes);
        setLootBoxes(response.data.lootBoxes);
      })
      .catch((error) => {
        console.error('Failed to fetch loot boxes:', error.response.data);
      });
  };

  // Fetch lootboxes when the component mounts
  useEffect(() => {
    fetchPlayers();
    fetchLootBoxes();
  }, []);

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
  const handleShowLootBoxes = () => {
    setCurrentContent('lootBoxes');
    fetchLootBoxes();
  };

  const handleCreateLootBox = () => {
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
    // fetchPlayers();
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

  const viewLootBox = (lootBox) => {
    fetchPlayers(); // Get the currently online players cause we're gonna need that in the modal which opens
    console.log("Getting details for loot box:", lootBox)
    axios.get(`/api/lootboxes/${lootBox.id}`, { headers: headers })
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

  const deleteLootBox = (lootBox) => {
    // axios.delete(`/api/lootboxes/${lootBox.id}`, { headers: headers })
    axios.delete(`/api/lootboxes/${lootBox.id}`)
    .then(response => {
      console.log(response.data.message);
      fetchLootBoxes(); // Fetch the updated list of loot boxes
    })
    .catch(error => console.error('Error deleting loot box:', error))
    .finally(setViewLootBoxModal(false));
  }

  const issueLootToPlayer = (lootBox) => {
    console.log("Issuing", lootBox, "to", selectedPlayer);
    // Issue items via API call to /api/lootboxes/<int:box_id>
    axios.post(`/api/lootboxes/${lootBox.id}`, { player: selectedPlayer }, { headers: headers })
    // axios.post(`/api/lootboxes/${lootBox.id}`, { player: selectedPlayer })
    .then(response => {
      console.log(response.data.message);
      setSelectedPlayer(null); // Clear the selected player
      fetchLootBoxes(); // Fetch the updated list of loot boxes
    })
    .catch(error => console.error('Error issuing loot box:', error))
    .finally(setViewLootBoxModal(false));
  };

  // Navigate to Maps page
  const handleShowSettlementManager = () => {
    // window.location.href = 'http://maps.raspberrypi.local';
    console.log("Settlement Manager Clicked");
  };

  // View Player Inventories
  const handleShowPlayerInventories = () => {
    setCurrentContent('playerInventories'); // Set the state to show player inventories
    fetchPlayers(); // Get the currently online players cause we're gonna need that in the modal which opens
  };

  const viewPlayerInventory = (player) => {
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
    if (socket == null) return;
    
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
    if (socket == null) return;

    socket.emit('combatants', combatants);
    console.log("combatants:", combatants);
  }, [combatants])

  const handleInitiative = () => {
    if (socket == null) return;

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
  setCurrentTurn(nextTurn);
  
  const current = { character: combatants[currentTurn], order: currentTurn + 1 };
  const next = { character: combatants[nextTurn], order: nextTurn + 1 };

  socket.emit('update turn', { current, next });
};

  const handleEndOfCombat = () => {
    if (socket == null) return;
    
    setCombatants([]); // Reset the combatants
    setCurrentTurn(0); // Reset the current turn
    setCurrentContent('lootBoxes'); // Or any other content you'd like to display
    socket.emit('end of combat'); // Notify players
  };


  // NPC Cards
  const fetchNpcs = (campaignId) => {
    axios.post('/api/npcs', { campaignId: campaignId }, { headers: headers })
      .then(response => {
        setNpcs(response.data);
      })
      .catch(error => {
        console.error('Failed to fetch NPCs:', error.response.data);
      });
  };

  const handleCreateNpc = () => {
    setNpcModalOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // console.log("name: ", name, "value: ", value);
    setNpcData({
      ...npcData,
      [name]: value
    });
  };
  
  useEffect(() => {
    console.log('NPC Data:', npcData);
  }, [npcData]);
  
  const handleSaveNpc = () => {
    console.log('Saving NPC:', npcData);
    const campaignId = headers['CampaignID'];
    const newNpc = {
      campaign_id: campaignId,
      ...npcData
    };
    axios.post('/api/npcs', newNpc, { headers: headers })
      .then(response => {
        console.log('NPC saved successfully:', response.data);
        setNpcs([...npcs, response.data]);
        setNpcModalOpen(false);
        setNpcData({
          name: '',
          size: '',
          creatureType: '',
          creatureSubtype: '',
          alignment: '',
          ac: '',
          hp: '',
          speed: '',
          strength: '',
          dexterity: '',
          constitution: '',
          intelligence: '',
          wisdom: '',
          charisma: '',
          saving_throws: '',
          skills: '',
          immunities: '',
          resistance: '',
          senses: '',
          languages: '',
          challenge: '',
          traits: '',
          actions: '',
          description: ''
        });
      })
      .catch(error => {
        console.error('Failed to save NPC:', error.response.data);
      });
  };

  const handleNpcClick = (npc) => {
    setSelectedNpc(npc);
  };

  const handleShowNPCCards = () => {
    const campaignId = headers['CampaignID'];
    fetchNpcs(campaignId);
    setCurrentContent('npcCards');
  };


  // Random Tables to Roll On
  const [randomTableModalOpen, setRandomTableModalOpen] = useState(false);
  const [randomTableData, setRandomTableData] = useState({
    name: '',
    description: '',
    diceType: '',
    entries: []
  });

  const [entryMinRoll, setEntryMinRoll] = useState('');
  const [entryMaxRoll, setEntryMaxRoll] = useState('');
  const [entryResult, setEntryResult] = useState('');

  const fetchRandomTables = () => {
    axios.get('/api/random_tables', { headers: headers })
      .then(response => {
        console.log("Tables-", response.data);
        setRandomTables(response.data);
      })
      .catch(error => {
        console.error('Failed to fetch random tables:', error.response.data);
      });
  };

  const handleShowRandomTables = () => {
    fetchRandomTables();
    setCurrentContent('Random Tables');
  }

  const handleTableSelect = (table) => {
    console.log("selected: ", table.name);
  };

  const handleCreateTable = () => {
    setRandomTableModalOpen(true);
  };

  // Update the entries in randomTableData directly
  const handleAddEntry = () => {
    const newEntry = {
      min_roll: entryMinRoll,
      max_roll: entryMaxRoll,
      result: entryResult
    };

    setRandomTableData(prevData => ({
      ...prevData,
      entries: [...prevData.entries, newEntry]
    }));

    // Clear the entry fields after adding
    setEntryMinRoll('');
    setEntryMaxRoll('');
    setEntryResult('');
  };

  // Remove entry by index in the entries array
  const handleRemoveEntry = (index) => {
    setRandomTableData(prevData => ({
      ...prevData,
      entries: prevData.entries.filter((_, i) => i !== index)
    }));
  };

  const handleSaveRandomTable = () => {
    const newTable = {
      campaign_id: headers['CampaignID'],
      ...randomTableData,
    };

    axios.post('/api/random_tables', newTable, { headers: headers })
      .then(response => {
        console.log('Table created successfully:', response.data);

        // Reset the form and close the modal
        setRandomTableModalOpen(false);
        setRandomTableData({
          name: '',
          description: '',
          diceType: '',
          entries: []
        });
      })
      .catch(error => {
        console.error('Failed to create table:', error.response.data);
      });
  };


  // Transaction History
  const [itemTransfers, setItemTransfers] = useState([]);
  const fetchItemTransfers = () => {
    axios.get('/api/item_transfers')
    .then(response => {
      setItemTransfers(response.data);
    })
    .catch(error => {
      console.error('Failed to fetch item transfers:', error);
    });
  };

  const handleShowTransactionHistory = () => {
    fetchItemTransfers();
    setCurrentContent('Transaction History');
  };



  // TODO: Future Expansion
  const handleShowBuildEncounter = () => {
    navigate('/library');
  };

  
  return (
    <>
      <Container>
        <Row>
          <Col>
            <h1>DM Tools</h1>
            <div class="btn-group-vertical">
              <Button onClick={handleShowSettlementManager}>Settlement Manager</Button>
              <Button onClick={handleShowLootBoxes}>Loot Boxes</Button>
              <Button onClick={handleShowRandomTables}>Tables to Roll On</Button>
              <Button onClick={handleShowPlayerInventories}>View player inventories</Button>
              <Button onClick={handleShowNPCCards}>NPC cards</Button>
              <Button onClick={handleInitiative}>Roll for Initiative</Button>
              {/* Other DM tools */}
              <Button onClick={handleShowBuildEncounter}>Build Encounter</Button>
              <Button onClick={handleShowTransactionHistory}>Transaction History</Button>
            </div>
          </Col>
          <Col>
            {currentContent === 'lootBoxes' && (
              <>
                <h2>Loot Boxes</h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button onClick={handleCreateLootBox}>Create Loot Box</Button>
                </div>
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
            {currentContent === 'npcCards' && (
              <>
                <h2>NPC Cards</h2>
                <Button onClick={handleCreateNpc}>Create NPC</Button>
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>CR</th>
                      <th>AC</th>
                      <th>HP</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {npcs.map((npc, i) => (
                      <tr key={i} onClick={() => handleNpcClick(npc)}>
                        <td>{npc.name}</td>
                        <td>{npc.challenge}</td>
                        <td>{npc.ac}</td>
                        <td>{npc.hp}</td>
                        <td>
                          <Button variant="primary" onClick={() => handleNpcClick(npc)}>
                            View Actions
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
            {currentContent === 'Random Tables' && (
              <>
                <h2>Random Roll Tables</h2>
                <Button onClick={handleCreateTable}>Add a Roll Table</Button>
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {randomTables.map((table, i) => (
                      <tr key={i} onClick={() => handleTableSelect(table)}>
                        <td>{table.name}</td>
                        <td>
                          <Button variant="primary" onClick={() => handleTableSelect(table)}>
                            Select
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
            {currentContent === 'Transaction History' && (
              <>
                <h2>Transaction History</h2>
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sender</th>
                      <th>Recipients</th>
                      <th>Item</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemTransfers.map((transfer, i) => (
                      <tr key={i}>
                        <td>{new Date(transfer.timestamp).toLocaleString()}</td>
                        <td>{transfer.sender_id}</td>
                        <td>{transfer.recipient_ids.join(', ')}</td>
                        <td>{transfer.item_id}</td>
                        <td>{transfer.message_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
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
          <Form.Control as="select" onChange={e => setSelectedPlayer(JSON.parse(e.target.value))}>
            <option value="" disabled selected>Select a player</option>
            {players.map((player, index) => (
              <option key={index} value={JSON.stringify(player)}>{player.character_name}</option>
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

      {/* Create NPC Modal */}
      <Modal show={npcModalOpen} onHide={() => setNpcModalOpen(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Create NPC</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <InputFormGroup
              label="Name"
              type="text"
              value={npcData.name}
              onChange={handleInputChange}
              name="name"
            />
            <Form.Group>
              <Form.Label>Size</Form.Label>
              <Form.Control
                as="select"
                value={npcData.size}
                onChange={handleInputChange}
                name="size"
              >
                <option value="Tiny">Tiny</option>
                <option value="Small">Small</option>
                <option value="Medium">Medium</option>
                <option value="Large">Large</option>
                <option value="Huge">Huge</option>
                <option value="Gargantuan">Gargantuan</option>
              </Form.Control>
            </Form.Group>
            <InputFormGroup
              label="Creature Type"
              type="text"
              value={npcData.creatureType}
              onChange={handleInputChange}
              name="creatureType"
            />
            <InputFormGroup
              label="Creature Subtype"
              type="text"
              value={npcData.creatureSubtype}
              onChange={handleInputChange}
              name="creatureSubtype"
            />
            <Form.Group>
              <Form.Label>Alignment</Form.Label>
              <Form.Control
                as="select"
                value={npcData.alignment}
                onChange={handleInputChange}
                name="alignment"
              >
                <option value="" disabled>Select alignment</option>
                {alignments.map(alignment => (
                  <option key={alignment} value={alignment}>{alignment}</option>
                ))}
              </Form.Control>
            </Form.Group>
            <InputFormGroup
              label="AC"
              type="number"
              value={npcData.ac}
              onChange={handleInputChange}
              name="ac"
            />
            <InputFormGroup
              label="HP"
              type="number"
              value={npcData.hp}
              onChange={handleInputChange}
              name="hp"
            />
            <InputFormGroup
              label="Speed"
              type="number"
              value={npcData.speed}
              onChange={handleInputChange}
              name="speed"
            />
            <InputFormGroup
              label="Strength"
              type="number"
              value={npcData.strength}
              onChange={handleInputChange}
              name="strength"
            />
            <InputFormGroup
              label="Dexterity"
              type="number"
              value={npcData.dexterity}
              onChange={handleInputChange}
              name="dexterity"
            />
            <InputFormGroup
              label="Constitution"
              type="number"
              value={npcData.constitution}
              onChange={handleInputChange}
              name="constitution"
            />
            <InputFormGroup
              label="Intelligence"
              type="number"
              value={npcData.intelligence}
              onChange={handleInputChange}
              name="intelligence"
            />
            <InputFormGroup
              label="Wisdom"
              type="number"
              value={npcData.wisdom}
              onChange={handleInputChange}
              name="wisdom"
            />
            <InputFormGroup
              label="Charisma"
              type="number"
              value={npcData.charisma}
              onChange={handleInputChange}
              name="charisma"
            />
            <InputFormGroup
              label="Saving Throws"
              type="text"
              value={npcData.saving_throws}
              onChange={handleInputChange}
              name="saving_throws"
            />
            <InputFormGroup
              label="Skills"
              type="text"
              value={npcData.skills}
              onChange={handleInputChange}
              name="skills"
            />
            <InputFormGroup
              label="Immunities"
              type="text"
              value={npcData.immunities}
              onChange={handleInputChange}
              name="immunities"
            />
            <InputFormGroup
              label="Resistance"
              type="text"
              value={npcData.resistance}
              onChange={handleInputChange}
              name="resistance"
            />
            <InputFormGroup
              label="Senses"
              type="text"
              value={npcData.senses}
              onChange={handleInputChange}
              name="senses"
            />
            <InputFormGroup
              label="Languages"
              type="text"
              value={npcData.languages}
              onChange={handleInputChange}
              name="languages"
            />
            <InputFormGroup
              label="Challenge"
              type="text"
              value={npcData.challenge}
              onChange={handleInputChange}
              name="challenge"
            />
            <InputFormGroup
              label="Traits"
              type="textarea"
              value={npcData.traits}
              onChange={handleInputChange}
              name="traits"
            />
            <InputFormGroup
              label="Actions"
              type="textarea"
              value={npcData.actions}
              onChange={handleInputChange}
              name="actions"
            />
            <InputFormGroup
              label="Description"
              type="textarea"
              value={npcData.description}
              onChange={handleInputChange}
              name="description"
            />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleSaveNpc}>Save</Button>
        </Modal.Footer>
      </Modal>

      {/* View NPC Actions Modal */ }
      {selectedNpc && (
        <Modal show={true} onHide={() => setSelectedNpc(null)} centered>
          <Modal.Header closeButton>
            <Modal.Title>{selectedNpc.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p><strong>{selectedNpc.size} {selectedNpc.creature_type} ({selectedNpc.creature_subtype}), {selectedNpc.alignment}</strong></p>

            <Row>
              <Col><p><strong>Armor Class:</strong> {selectedNpc.ac}</p></Col>
              <Col><p><strong>Hit Points:</strong> {selectedNpc.hp}</p></Col>
              <Col><p><strong>Speed:</strong> {selectedNpc.speed} ft.</p></Col>
            </Row>

            {/* Stats in a single line */}
            <p><strong>STR</strong> {selectedNpc.strength}, <strong>DEX</strong> {selectedNpc.dexterity}, <strong>CON</strong> {selectedNpc.constitution},
              <strong>INT</strong> {selectedNpc.intelligence}, <strong>WIS</strong> {selectedNpc.wisdom}, <strong>CHA</strong> {selectedNpc.charisma}</p>

            <hr />

            {/* Grouping additional stats */}
            <Row>
              {selectedNpc.saving_throws ? <Col><p><strong>Saving Throws:</strong> {selectedNpc.saving_throws}</p></Col> : <></>}
              <Col><p><strong>Skills:</strong> {selectedNpc.skills}</p></Col>
              {selectedNpc.immunities ? <Col><p><strong>Immunities:</strong> {selectedNpc.immunities}</p></Col> : <></>}
              {selectedNpc.resistance ? <Col><p><strong>Resistance:</strong> {selectedNpc.resistance}</p></Col> : <></>}
              <Col><p><strong>Senses:</strong> {selectedNpc.senses}</p></Col>
              <Col><p><strong>Languages:</strong> {selectedNpc.languages}</p></Col>
              <Col><p><strong>Challenge:</strong> {selectedNpc.challenge}</p></Col>
            </Row>

            <hr />

            {/* Traits Section */}
            <p><strong><u>Traits</u></strong></p>
            <p>{selectedNpc.traits}</p>

            {/* Actions Section */}
            <p><strong><u>Actions</u></strong></p>
            <p>{selectedNpc.actions}</p>

            <hr />

            {/* Description as Flavor Text */}
            <p><strong>Description:</strong> {selectedNpc.description}</p>
          </Modal.Body>
        </Modal>)
      }

      {/* Random Tables to Roll On */}
      <Modal show={randomTableModalOpen} onHide={() => setRandomTableModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create Random Table</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            {/* Name */}
            <InputFormGroup
              label="Table Name"
              type="text"
              placeholder="Table Name"
              value={randomTableData.name}
              onChange={(e) => setRandomTableData(prevData => ({ ...prevData, name: e.target.value }))}
            />

            {/* Description */}
            <InputFormGroup
              label="Description"
              type="text"
              placeholder="Description"
              value={randomTableData.description}
              onChange={(e) => setRandomTableData(prevData => ({ ...prevData, description: e.target.value }))}
            />

            {/* Dice Type */}
            <InputFormGroup
              label="Dice Type"
              type="text"
              placeholder="Dice Type (e.g., 1d100)"
              value={randomTableData.diceType}
              onChange={(e) => setRandomTableData(prevData => ({ ...prevData, diceType: e.target.value }))}
            />

            <hr />
            <h5>Entries</h5>

            {/* Entry Fields */}
            <Row>
              <Col>
                <Form.Control
                  type="number"
                  placeholder="Min Roll"
                  value={entryMinRoll}
                  onChange={(e) => setEntryMinRoll(e.target.value)}
                />
              </Col>
              <Col>
                <Form.Control
                  type="number"
                  placeholder="Max Roll"
                  value={entryMaxRoll}
                  onChange={(e) => setEntryMaxRoll(e.target.value)}
                />
              </Col>
              <Col>
                <Form.Control
                  type="text"
                  placeholder="Result"
                  value={entryResult}
                  onChange={(e) => setEntryResult(e.target.value)}
                />
              </Col>
              <Col>
                <Button variant="primary" onClick={handleAddEntry}>Add Entry</Button>
              </Col>
            </Row>

            {/* Display Table Entries */}
            <Table striped bordered hover className="mt-3">
              <thead>
                <tr>
                  <th>Min Roll</th>
                  <th>Max Roll</th>
                  <th>Result</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {randomTableData.entries.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.min_roll}</td>
                    <td>{entry.max_roll}</td>
                    <td>{entry.result}</td>
                    <td>
                      <Button variant="danger" onClick={() => handleRemoveEntry(index)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setRandomTableModalOpen(false)}>Close</Button>
          <Button variant="primary" onClick={handleSaveRandomTable}>Save Table</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default DMTools;