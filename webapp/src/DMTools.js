import NpcLibrary from './NpcLibrary';
import SessionManagement from './SessionManagement';
import EncounterBuilder from './EncounterBuilder';
import useSessionManagement from './useSessionManagement';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Modal, Form, ListGroup } from 'react-bootstrap';
import { Table, InputGroup, FormControl } from 'react-bootstrap';
import { Row, Col } from 'react-bootstrap';

import axios from 'axios';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import Inventory2Icon from '@mui/icons-material/Inventory2';
import CasinoIcon from '@mui/icons-material/Casino';
import GroupsIcon from '@mui/icons-material/Groups';
import BadgeIcon from '@mui/icons-material/Badge';
import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import SettingsIcon from '@mui/icons-material/Settings';
import HistoryIcon from '@mui/icons-material/History';
import Tooltip from '@mui/material/Tooltip';

import './DMTools.css';
import { DMSoundPlayerWorkspace } from './DMSoundPlayer';
import CampaignSettings from './CampaignSettings';

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

const catalogScopeLabel = (record, modules) => {
  const moduleName = modules.find(module => module.module_key === record.module_key)?.module_name || record.module_key;
  if (record.scope === 'module_preset') return `${moduleName || 'Module'} preset`;
  if (record.scope === 'system_preset') return `${record.system || 'System'} preset`;
  return moduleName ? `Campaign · ${moduleName}` : 'Campaign';
};

function DMTools({ headers, socket, characterName, accountType, onSoundWorkspaceChange, soundPlayerOpenRequest, onSoundWorkspaceRequestHandled }) {
  const navigate = useNavigate();
  const sessionApi = useSessionManagement(headers, socket);

  useEffect(() => {
    if (accountType?.toLowerCase() === 'player') {
      navigate('/characterSheet');
    }
  }, [accountType, navigate]);

  const [lootBoxes, setLootBoxes] = useState([]);
  const [catalogModules, setCatalogModules] = useState([]);
  const [currentContent, setCurrentContent] = useState('sessionManagement');

  useEffect(() => {
    onSoundWorkspaceChange?.(currentContent === 'soundPlayer');
  }, [currentContent, onSoundWorkspaceChange]);

  useEffect(() => () => onSoundWorkspaceChange?.(false), [onSoundWorkspaceChange]);

  useEffect(() => {
    if (soundPlayerOpenRequest) {
      setCurrentContent('soundPlayer');
      onSoundWorkspaceRequestHandled?.(0);
    }
  }, [soundPlayerOpenRequest, onSoundWorkspaceRequestHandled]);


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
        setCatalogModules(response.data.modules || []);
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
  const [lootBoxModuleKey, setLootBoxModuleKey] = useState('');
  const [items, setItems] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);

  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedLootBox, setSelectedLootBox] = useState({ items: [] });
  const [viewLootBoxModal, setViewLootBoxModal] = useState(false);
  const [editingLootBoxId, setEditingLootBoxId] = useState(null);
  const [lootBoxSaving, setLootBoxSaving] = useState(false);
  const [lootBoxSaveError, setLootBoxSaveError] = useState('');

  const [inventory, setInventory] = useState([]);
  const [viewPlayerInventoryModal, setViewPlayerInventoryModal] = useState(false);

  // Loot Box Functions
  const handleShowLootBoxes = () => {
    setCurrentContent('lootBoxes');
    fetchLootBoxes();
  };

  const handleCreateLootBox = () => {
    setEditingLootBoxId(null);
    setLootBoxName('');
    setLootBoxModuleKey('');
    setSelectedItems([]);
    setLootBoxSaveError('');
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
    setSelectedItems(prevItems => {
      const existing = prevItems.find(candidate => candidate.id === item.id);
      if (!existing) return [...prevItems, { ...item, quantity: 1 }];
      return prevItems.map(candidate => candidate.id === item.id
        ? {...candidate, quantity:Number(candidate.quantity || 0) + 1}
        : candidate);
    });
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

  const handleLootBoxClick = async lootBox => {
    if (lootBox.editable === false) return;
    setLootBoxSaveError('');
    setLootBoxName(lootBox.name);
    setLootBoxModuleKey(lootBox.module_key || '');
    setEditingLootBoxId(lootBox.id);
    try {
      const response = Array.isArray(lootBox.items)
        ? {data:lootBox}
        : await axios.get(`/api/lootboxes/${lootBox.id}`, {headers});
      setSelectedItems(response.data.items || []);
      setLootBoxModalOpen(true);
    } catch (requestError) {
      setLootBoxSaveError(requestError.response?.data?.message || 'That loot box could not be opened for editing.');
    }
  };

  const handleSaveLootBox = async () => {
    const name = lootBoxName.trim();
    if (!name) { setLootBoxSaveError('Enter a name before saving the loot box.'); return; }
    const payload = {name, items:selectedItems.map(item => ({id:item.id,quantity:Number(item.quantity || 1)})), module_key:lootBoxModuleKey || null};
    setLootBoxSaving(true);
    setLootBoxSaveError('');
    try {
      if (editingLootBoxId === null) await axios.post('/api/lootboxes', payload, {headers});
      else await axios.put(`/api/lootboxes/${editingLootBoxId}`, payload, {headers});
      setLootBoxModalOpen(false);
      setLootBoxName('');
      setLootBoxModuleKey('');
      setSelectedItems([]);
      setEditingLootBoxId(null);
      fetchLootBoxes();
    } catch (requestError) {
      setLootBoxSaveError(requestError.response?.data?.message || 'The loot box could not be saved. Please try again.');
    } finally { setLootBoxSaving(false); }
  };

  const viewLootBox = (lootBox) => {
    fetchPlayers(); // Get the currently online players cause we're gonna need that in the modal which opens
    console.log("Getting details for loot box:", lootBox)
    if (Array.isArray(lootBox.items)) {
      setSelectedLootBox(lootBox);
      setViewLootBoxModal(true);
      return;
    }
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
    setLootBoxModuleKey(selectedLootBox.module_key || '');
    setEditingLootBoxId(selectedLootBox.id); // So we can update an existing loot box
    setLootBoxModalOpen(true);
    setViewLootBoxModal(false);
  };

  const deleteLootBox = (lootBox) => {
    axios.delete(`/api/lootboxes/${lootBox.id}`, { headers: headers })
    .then(response => {
      console.log(response.data.message);
      setLootBoxes(current => current.filter(candidate => candidate.id !== lootBox.id));
    })
    .catch(error => console.error('Error deleting loot box:', error))
    .finally(() => setViewLootBoxModal(false));
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

  const handleShowNPCCards = () => {
    setCurrentContent('npcCards');
  };


  // Random Tables to Roll On
  const [randomTables, setRandomTables] = useState([]);
  const [encounterPresets, setEncounterPresets] = useState([]);
  const [encounterRoll, setEncounterRoll] = useState(null);
  const [encounterTableError, setEncounterTableError] = useState('');
  const [randomTableData, setRandomTableData] = useState({
    name: '',
    description: '',
    diceType: '',
    moduleKey: '',
    entries: []
  });
  const [randomTableModalOpen, setRandomTableModalOpen] = useState(false);
  const [viewTableModalOpen, setViewTableModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedTableEntries, setSelectedTableEntries] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  const [entryMinRoll, setEntryMinRoll] = useState('');
  const [entryMaxRoll, setEntryMaxRoll] = useState('');
  const [entryResult, setEntryResult] = useState('');


  // Fetch random tables from Flask and the database
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

  const fetchEncounterPresets = () => {
    axios.get('/api/encounter-presets', { headers: headers })
      .then(response => setEncounterPresets(response.data || []))
      .catch(error => setEncounterTableError(error.response?.data?.message || 'Random encounter tables could not be loaded.'));
  };

  const rollEncounterPreset = (preset) => {
    setEncounterTableError('');
    axios.post('/api/encounter-presets/roll', { preset_id: preset.id }, { headers: headers })
      .then(response => setEncounterRoll({ ...response.data, tableName: preset.name }))
      .catch(error => setEncounterTableError(error.response?.data?.message || 'That random encounter could not be rolled.'));
  };

  const handleShowRandomTables = () => {
    fetchRandomTables();
    fetchEncounterPresets();
    setCurrentContent('Random Tables');
  }

  const handleTableSelect = (table) => {
    console.log("selected: ", table.name);
    axios.get(`/api/random_tables/${table.id}`, { headers: headers })
      .then(response => {
        setSelectedTable(response.data);
        setSelectedTableEntries(response.data.table_entries);
        setViewTableModalOpen(true);
      })
      .catch(error => {
        console.error('Failed to fetch table entries:', error);
      });
  };

  const openCreateTableModal = () => {
    setRandomTableModalOpen(true);
  };

  // Fetch tables on component mount
  useEffect(() => {
    fetchRandomTables();
  }, []);

  // Function to handle table creation or update
  const handleSaveRandomTable = () => {
    if (isEditing) {
      // Update existing table
      axios.put(`/api/random_tables/${selectedTable.id}`, randomTableData, { headers: headers })
        .then(response => {
          console.log('Table updated successfully:', response.data);
          fetchRandomTables();
          setRandomTableModalOpen(false);
          setRandomTableData({
            name: '',
            description: '',
            diceType: '',
            moduleKey: '',
            entries: []
          });
          setIsEditing(false);
        })
        .catch(error => {
          console.error('Error updating table:', error);
        });
    } else {
      // Create new table
      axios.post('/api/random_tables', randomTableData, { headers: headers })
        .then(response => {
          console.log('Table created successfully:', response.data);
          fetchRandomTables();
          setRandomTableModalOpen(false);
          setRandomTableData({
            name: '',
            description: '',
            diceType: '',
            moduleKey: '',
            entries: []
          });
        })
        .catch(error => {
          console.error('Error creating table:', error);
        });
    }
  };

  // Function to handle adding an entry
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
    setEntryMinRoll('');
    setEntryMaxRoll('');
    setEntryResult('');
  };

  // Function to handle removing an entry
  const handleRemoveEntry = (index) => {
    setRandomTableData(prevData => ({
      ...prevData,
      entries: prevData.entries.filter((_, i) => i !== index)
    }));
  };

  // Function to handle editing a table
  const editRandomTable = () => {
    setViewTableModalOpen(false);
    setRandomTableData({
      name: selectedTable.name,
      description: selectedTable.description,
      diceType: selectedTable.dice_type,
      moduleKey: selectedTable.module_key || '',
      entries: selectedTable.table_entries
    });
    setIsEditing(true);
    setRandomTableModalOpen(true);
  };

  // Function to handle table deletion
  const deleteRandomTable = (tableId) => {
    axios.delete(`/api/random_tables/${tableId}`, { headers: headers })
      .then(response => {
        console.log('Table deleted successfully:', response.data);

        // Fetch the updated list of tables
        fetchRandomTables();

        // Close the view table modal
        setViewTableModalOpen(false);
        setSelectedTable(null);
      })
      .catch(error => {
        console.error('Error deleting table:', error);
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

  const TOOL_GROUPS = [
    { title: 'Session', items: [{ id: 'sessionManagement', label: 'Session Management', description: 'Prepare and run sessions, manage the party, encounters, notes and world clock.', icon: <GroupsIcon fontSize="small" /> }] },
    {
      title: 'Prepare',
      items: [
        {
          id: 'lootBoxes',
          label: 'Loot Boxes',
          description: 'Create, inspect, edit, and assign saved loot packages.',
          icon: <Inventory2Icon fontSize="small" />,
        },
        {
          id: 'npcCards',
          label: 'NPC Library',
          description: 'Create and manage saved NPC cards for this campaign.',
          icon: <BadgeIcon fontSize="small" />,
        },
        {
          id: 'encounterBuilder',
          label: 'Encounter Builder',
          description: 'Create reusable encounters from creatures and named campaign NPCs.',
          icon: <SportsKabaddiIcon fontSize="small" />,
        },
        {
          id: 'campaignSettings',
          label: 'Campaign Settings',
          description: 'Install campaign modules and reconcile shared world settings.',
          icon: <SettingsIcon fontSize="small" />,
        },
      ],
    },
    {
      title: 'Run',
      items: [
        {
          id: 'soundPlayer',
          label: 'Music Player',
          description: 'Mix looping ambience and music with independent one-shot sound effects.',
          icon: <MusicNoteIcon fontSize="small" />,
        },
        {
          id: 'playerInventories',
          label: 'Player Inventories',
          description: 'Inspect player inventories without changing them directly.',
          icon: <GroupsIcon fontSize="small" />,
          actionLabel: 'Refresh Players',
          action: fetchPlayers,
        },
        {
          id: 'transactionHistory',
          label: 'Transaction History',
          description: 'Review item transfers and table-side activity.',
          icon: <HistoryIcon fontSize="small" />,
          actionLabel: 'Refresh History',
          action: fetchItemTransfers,
        },
        {
          id: 'randomTables',
          label: 'Random Tables',
          description: 'Create and roll on random event and result tables.',
          icon: <CasinoIcon fontSize="small" />,
          actionLabel: 'Add Roll Table',
          action: openCreateTableModal,
        },
        {
          id: 'initiative',
          label: 'Enter Combat',
          description: 'Prompt players to roll initiative and begin turn tracking.',
          icon: <SportsKabaddiIcon fontSize="small" />,
        },
      ],
    },
  ];

  const toolLookup = Object.fromEntries(
    TOOL_GROUPS.flatMap((group) => group.items.map((tool) => [tool.id, tool]))
  );

  const activeTool = toolLookup[currentContent === 'Random Tables' ? 'randomTables' : currentContent === 'Transaction History' ? 'transactionHistory' : currentContent] || toolLookup.sessionManagement;

  const selectTool = (toolId) => {
    switch (toolId) {
      case 'lootBoxes':
        handleShowLootBoxes();
        break;
      case 'playerInventories':
        handleShowPlayerInventories();
        break;
      case 'soundPlayer':
        setCurrentContent('soundPlayer');
        break;
      case 'campaignSettings':
        setCurrentContent('campaignSettings');
        break;
      case 'initiative':
        setCurrentContent('initiative');
        break;
      case 'npcCards':
        handleShowNPCCards();
        break;
      case 'randomTables':
        handleShowRandomTables();
        break;
      case 'transactionHistory':
        handleShowTransactionHistory();
        break;
      case 'encounterBuilder':
        setCurrentContent('encounterBuilder');
        break;
      case 'sessionManagement':
      default:
        setCurrentContent('sessionManagement');
        break;
    }
  };

  const renderLootBoxes = () => (
    <>
      <div className="dmtools-section-actions">
        <Button onClick={handleCreateLootBox}>Create Loot Box</Button>
      </div>

      <div className="dmtools-table-shell">
        <Table striped bordered hover className="dmtools-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Scope</th>
              <th style={{ width: '180px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lootBoxes.length === 0 ? (
              <tr>
                <td colSpan={3} className="dmtools-empty-cell">
                  No loot boxes yet.
                </td>
              </tr>
            ) : (
              lootBoxes.map((lootBox, i) => (
                <tr key={i}>
                  <td>{lootBox.name}</td>
                  <td><span className={`catalog-scope ${lootBox.is_preset?'preset':''}`}>{catalogScopeLabel(lootBox,catalogModules)}</span></td>
                  <td>
                    <div className="dmtools-inline-actions">
                      <Button size="sm" variant="primary" onClick={() => viewLootBox(lootBox)}>
                        Examine
                      </Button>
                      {lootBox.editable!==false&&<Button size="sm" variant="outline-light" onClick={() => handleLootBoxClick(lootBox)}>Edit</Button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </>
  );

  const renderPlayerInventories = () => (
    <div className="dmtools-table-shell">
      <Table striped bordered className="dmtools-table">
        <thead>
          <tr>
            <th>Player</th>
            <th style={{ width: '180px' }}>View</th>
          </tr>
        </thead>
        <tbody>
          {players.filter(player => player.id !== null).length === 0 ? (
            <tr>
              <td colSpan={2} className="dmtools-empty-cell">No players found.</td>
            </tr>
          ) : (
            players.filter(player => player.id !== null).map((player, i) => (
              <tr key={i}>
                <td>{player.character_name}</td>
                <td>
                  <Button variant="primary" size="sm" onClick={() => viewPlayerInventory(player)}>
                    Examine
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );

  const renderNpcCards = () => null;

  const renderRandomTables = () => (
    <>
      <section className="dmtools-random-encounters" aria-labelledby="random-encounter-tables-heading">
        <div className="dmtools-section-heading">
          <div><h3 id="random-encounter-tables-heading">Random Encounter Tables</h3><p>Roll the same environment tables available in Encounter Builder.</p></div>
        </div>
        {encounterTableError && <Alert variant="danger">{encounterTableError}</Alert>}
        <div className="dmtools-table-shell">
          <Table striped bordered hover className="dmtools-table">
            <thead><tr><th>Environment</th><th>Level</th><th>Source</th><th style={{ width: '120px' }}>Roll</th></tr></thead>
            <tbody>
              {encounterPresets.length === 0 ? <tr><td colSpan={4} className="dmtools-empty-cell">No environment encounter tables are available for this campaign.</td></tr> : encounterPresets.map(preset => (
                <tr key={preset.id}>
                  <td>{preset.name}</td>
                  <td>{preset.min_level || preset.max_level ? `${preset.min_level || 1}–${preset.max_level || '+'}` : 'Any'}</td>
                  <td>{preset.source}</td>
                  <td><Button size="sm" onClick={() => rollEncounterPreset(preset)}>Roll</Button></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        {encounterRoll && <Alert variant="info" className="dmtools-encounter-result" role="status">
          <strong>{encounterRoll.tableName} result</strong>
          <p>{encounterRoll.notes}</p>
          {encounterRoll.participants?.length > 0 && <ul>{encounterRoll.participants.map((participant, index) => <li key={`${participant.id || participant.name}-${index}`}>{participant.quantity || 1} × {participant.name}</li>)}</ul>}
        </Alert>}
      </section>

      <div className="dmtools-section-heading"><div><h3>Campaign Roll Tables</h3><p>Create and manage reusable campaign-specific tables.</p></div></div>
      <div className="dmtools-section-actions">
        <Button onClick={openCreateTableModal}>Add a Roll Table</Button>
      </div>

      <div className="dmtools-table-shell">
        <Table striped bordered hover className="dmtools-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Scope</th>
              <th style={{ width: '180px' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {randomTables.length === 0 ? (
              <tr>
                <td colSpan={3} className="dmtools-empty-cell">No roll tables created yet.</td>
              </tr>
            ) : (
              randomTables.map((table, i) => (
                <tr key={i}>
                  <td>{table.name}</td>
                  <td><span className={`catalog-scope ${table.is_preset?'preset':''}`}>{catalogScopeLabel(table,catalogModules)}</span></td>
                  <td>
                    <Button variant="primary" size="sm" onClick={() => handleTableSelect(table)}>
                      Select
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </>
  );

  const renderTransactionHistory = () => (
    <div className="dmtools-table-shell">
      <Table striped bordered hover className="dmtools-table">
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
          {itemTransfers.length === 0 ? (
            <tr>
              <td colSpan={5} className="dmtools-empty-cell">No transactions found.</td>
            </tr>
          ) : (
            itemTransfers.map((transfer, i) => (
              <tr key={i}>
                <td>{new Date(transfer.timestamp).toLocaleString()}</td>
                <td>{transfer.sender_id}</td>
                <td>{transfer.recipient_ids.join(', ')}</td>
                <td>{transfer.item_id}</td>
                <td>{transfer.message_text}</td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );

  const renderWorkspaceBody = () => {
    switch (currentContent) {
      case 'lootBoxes':
        return renderLootBoxes();
      case 'playerInventories':
        return renderPlayerInventories();
      case 'sessionManagement':
      case 'initiative':
        return <SessionManagement api={sessionApi} headers={headers} initialTab="Run Session" />;
      case 'encounterBuilder':
        return <EncounterBuilder api={sessionApi} headers={headers} />;
      case 'npcCards':
        return renderNpcCards();
      case 'randomTables':
      case 'Random Tables':
        return renderRandomTables();
      case 'transactionHistory':
      case 'Transaction History':
        return renderTransactionHistory();
      case 'soundPlayer':
        return <DMSoundPlayerWorkspace />;
      case 'campaignSettings':
        return <CampaignSettings headers={headers} campaignID={headers?.campaignID || headers?.CampaignID} embedded />;
      default:
        return <SessionManagement api={sessionApi} headers={headers} />;
    }
  };

  const workspaceTitle = activeTool.label;
  const workspaceDescription = activeTool.description;
  const workspaceActionLabel = ['encounterBuilder', 'initiative'].includes(currentContent) ? null : activeTool?.actionLabel || null;
  const workspaceAction = activeTool?.action || null;


  return (
    <>
      <div className="dmtools-page">
        <aside className="dmtools-rail">
          <div className="dmtools-rail-header">
            <h1>DM Tools</h1>
            <p>GM workbench</p>
          </div>

          <div className="dmtools-rail-nav">
            {TOOL_GROUPS.map((group) => (
              <div className="dmtools-rail-group" key={group.title}>
                <div className="dmtools-rail-group-title">{group.title}</div>

                {group.items.map((tool) => {
                  const isActive =
                    currentContent === tool.id ||
                    (tool.id === 'randomTables' && currentContent === 'Random Tables') ||
                    (tool.id === 'transactionHistory' && currentContent === 'Transaction History');

                  return (
                    <Tooltip key={tool.id} title={tool.description} placement="right" describeChild>
                      <button
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        className={`dmtools-rail-item ${isActive ? 'is-active' : ''}`}
                        onClick={() => selectTool(tool.id)}
                      >
                        <span className="dmtools-rail-item-icon">{tool.icon}</span>
                        <span className="dmtools-rail-item-text">
                          <span className="dmtools-rail-item-label">{tool.label}</span>
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="dmtools-workspace">
          <div hidden={['sessionManagement', 'encounterBuilder', 'initiative'].includes(currentContent)} className={`dmtools-workspace-header ${['sessionManagement', 'encounterBuilder', 'initiative'].includes(currentContent) ? 'settlement-hidden' : ''}`}>
            <div className="dmtools-workspace-heading">
              <h2>{workspaceTitle}</h2>
              <p>{workspaceDescription}</p>
            </div>

            {workspaceActionLabel && workspaceAction ? (
              <div className="dmtools-workspace-actions">
                <Button onClick={workspaceAction}>{workspaceActionLabel}</Button>
              </div>
            ) : null}
          </div>

          <div className="dmtools-workspace-body">
            {renderWorkspaceBody()}
      <NpcLibrary headers={headers} visible={currentContent === 'npcCards'} onPlace={(npc, settlementId) => navigate(`/settlementManager?tool=npcs&settlement_id=${encodeURIComponent(settlementId)}&place_npc=${encodeURIComponent(npc.id)}`)} />
          </div>
        </section>
      </div>

      {/* Create Loot Box Modal */}
      <Modal show={lootBoxModalOpen} onHide={() => setLootBoxModalOpen(false)} centered fullscreen>
        <Modal.Header closeButton>
          <Modal.Title>{editingLootBoxId === null ? 'Create Loot Box' : 'Edit Loot Box'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {lootBoxSaveError && <Alert variant="danger" role="alert">{lootBoxSaveError}</Alert>}
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
              <Form.Group className="mt-3">
                <Form.Label>Catalog scope</Form.Label>
                <Form.Select value={lootBoxModuleKey} onChange={event=>setLootBoxModuleKey(event.target.value)}>
                  <option value="">Entire campaign</option>
                  {catalogModules.map(module=><option key={module.module_key} value={module.module_key}>{module.module_name}</option>)}
                </Form.Select>
                <Form.Text>Optionally associate this loot box with an installed module.</Form.Text>
              </Form.Group>
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
          <Button onClick={handleSaveLootBox} disabled={lootBoxSaving}>{lootBoxSaving ? 'Saving…' : 'Save'}</Button>
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
              {selectedLootBox?.editable!==false&&<Col>
                <Button variant="primary" onClick={editLootBox}>
                  <EditIcon /> Edit
                </Button>
                <Button variant="danger" onClick={() => deleteLootBox(selectedLootBox)}>
                  <DeleteIcon /> Delete
                </Button>
              </Col>}
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
          <Form.Control as="select" value={selectedPlayer ? JSON.stringify(selectedPlayer) : ''} onChange={e => setSelectedPlayer(JSON.parse(e.target.value))}>
            <option value="" disabled>Select a player</option>
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


      {/* Modal for creating/editing a random table */}
      <Modal show={randomTableModalOpen} onHide={() => setRandomTableModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{isEditing ? 'Edit Random Table' : 'Create Random Table'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <InputFormGroup
              label="Table Name"
              type="text"
              placeholder="Table Name"
              value={randomTableData.name}
              onChange={(e) => setRandomTableData(prevData => ({ ...prevData, name: e.target.value }))}
            />
            <InputFormGroup
              label="Description"
              type="textarea"
              placeholder="Description"
              value={randomTableData.description}
              onChange={(e) => setRandomTableData(prevData => ({ ...prevData, description: e.target.value }))}
            />
            <InputFormGroup
              label="Dice Type"
              type="text"
              placeholder="Dice Type (e.g., 1d100)"
              value={randomTableData.diceType}
              onChange={(e) => setRandomTableData(prevData => ({ ...prevData, diceType: e.target.value }))}
            />
            <Form.Group className="mt-3">
              <Form.Label>Catalog scope</Form.Label>
              <Form.Select value={randomTableData.moduleKey||''} onChange={event=>setRandomTableData(value=>({...value,moduleKey:event.target.value}))}>
                <option value="">Entire campaign</option>
                {catalogModules.map(module=><option key={module.module_key} value={module.module_key}>{module.module_name}</option>)}
              </Form.Select>
              <Form.Text>Optionally associate this roll table with an installed module.</Form.Text>
            </Form.Group>

            <hr />
            <h5>Entries</h5>

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
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddEntry();
                    }
                  }}
                />
              </Col>
              <Col>
                <Button variant="primary" onClick={handleAddEntry}>Add Entry</Button>
              </Col>
            </Row>

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
                {randomTableData.entries
                  .sort((a, b) => a.min_roll - b.min_roll)
                  .map((entry, index) => (
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
          <Button variant="primary" onClick={handleSaveRandomTable}>{isEditing ? 'Save Changes' : 'Save Table'}</Button>
        </Modal.Footer>
      </Modal>

      {/* View Random Table Modal */}
      <Modal show={viewTableModalOpen} onHide={() => setViewTableModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <Row>
              <Col>
                {selectedTable?.name}
              </Col>
              {selectedTable?.editable!==false&&<Col>
                <Button variant="primary" onClick={editRandomTable}>
                  <EditIcon />
                </Button>
                <Col>
                  <Button variant="danger" onClick={() => deleteRandomTable(selectedTable.id)}>
                    <DeleteIcon />
                  </Button>
                </Col>
              </Col>}
            </Row>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>{selectedTable?.description}</p>
          <p>Dice Type: {selectedTable?.dice_type}</p>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>Min Roll</th>
                <th>Max Roll</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {selectedTable?.table_entries
                .sort((a, b) => a.min_roll - b.min_roll)
                .map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.min_roll}</td>
                    <td>{entry.max_roll}</td>
                    <td>{entry.result}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setViewTableModalOpen(false)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default DMTools;
