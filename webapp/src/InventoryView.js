import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';  // Makes API calls
import Papa from 'papaparse'; // parses CSV file
import { Stack, Container, Row, Col, Table, Button, ButtonGroup, Modal, ModalDialog, Form } from 'react-bootstrap';

// Mainly used for displaying error messages from the server
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// For making the table adjustable
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'

import SortIcon from '@mui/icons-material/Sort';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import 'bootstrap/dist/css/bootstrap.min.css';
import './InventoryView.css';

export default function InventoryView({ username, characterName, accountType, headers, socket, campaignID, isLoading, setIsLoading }) {
  const [inventory, setInventory] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  // const [showItemDetails, setShowItemDetails] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null); // Stores the file
  const [addingItems, setAddingItems] = useState(false);  // Used for adding mutliple items from a CSV file
  const [uploadedItems, setUploadedItems] = useState([]);
  const [fieldName, setFieldName] = useState([]);
  const [creatingItem, setCreatingItem] = useState(false);  // Used for creating a single item at a time

  const typeFields = {
    "Weapon": ['Damage', 'Damage Type', 'Range', 'Weapon Type'],
    "Armor": ['Armor Class', 'Strength'],
    "Mounts and Vehicles": ['Speed', 'Units', 'Capacity'],
    "SpellItem": ['Spell', 'Charges']
  }
  const alwaysEnabledFields = ['Name', 'Weight', 'Cost', 'Description'];


  // Fields for defining a new item
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('');
  const [newItemCost, setNewItemCost] = useState('');
  const [newItemCurrency, setNewItemCurrency] = useState('Gold');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemWeight, setNewItemWeight] = useState('');

  // Weapons & Armor stats
  const [newItemDamage, setNewItemDamage] = useState('');
  const [newItemDamageType, setNewItemDamageType] = useState('');
  const [newItemWeaponType, setNewItemWeaponType] = useState('');
  const [newItemRange, setNewItemRange] = useState('');
  const [newItemAC, setNewItemAC] = useState('');
  const [newItemStealthDisadvantage, setNewItemStealthDisadvantage] = useState(false);
  const [newItemStrengthNeeded, setNewItemStrengthNeeded] = useState(null);
  const [newItemArmorType, setNewItemArmorType] = useState('');

  // Mounts & Vehcile Stats
  const [newItemSpeed, setNewItemSpeed] = useState('');
  const [newItemSpeedUnit, setNewItemSpeedUnit] = useState('');
  const [newItemCapacity, setNewItemCapacity] = useState('');

  // Rings, Wands, and Scrolls stats
  const [newItemSpell, setNewItemSpell] = useState('');
  const [newItemCharges, setNewItemCharges] = useState('');

  // Used for updating item details
  const [showViewItemDetails, setShowViewItemDetails] = useState(false);
  const [showEditItemDetails, setShowEditItemDetails] = useState(false);

  const currencyValues = {
    'Copper': 1,
    'Silver': 10, // 1 Silver is worth 10 Copper
    'Electrum': 50, // 1 Electrum is worth 50 Copper
    'Gold': 100, // 1 Gold is worth 100 Copper
    'Platinum': 1000, // 1 Platinum is worth 1000 Copper
  };

  // Used for issuing items to players
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [quantity, setQuantity] = useState(1);  // For giving items or dropping

  // Define a function to display errors
  const handleError = (customMessage, error) => {
    const errorMessage = error.response?.data?.message || 'An unexpected error occurred';
    toast.error(`${customMessage}: ${errorMessage}`);
    console.error(`${customMessage}: ${errorMessage}`);
  };

  // Define a function to fetch players
  const fetchPlayers = () => {
    axios.get('/api/players', { headers: headers })
    .then(response => {
      console.log("INVENTORY VIEW- players:", response.data.players)
      setPlayers(response.data.players.filter(player => player.character_name !== characterName));
    })
    .catch(error => {
      console.error('Failed to fetch players:', error.response.data);
    })
  };

  useEffect(() => {
    console.log("player list updated:", players);
  }, [players])

  // Update active_users and list of players
  useEffect(() => {
    if (socket) {
      socket.on('active_users', fetchPlayers);

      return () => {
        socket.off('active_users');
      };
    }
  }, [socket]);

  // Update Player Inventory on change
  function fetchInventory() {
    console.log("**** Fetching Inventory ****");
    console.log("accountType:", accountType);
    if (accountType === 'Player') {
      axios.get('/api/inventory', { headers })
      .then(response => {
        console.log("INVENTORY- response:", response.data);
        setInventory(response.data.inventory); // Save all inventory items in state
      })
      .catch(error => {
        console.error('Error loading inventory:', error.response.data);
      });
    } else if (accountType === "DM") {
      axios.get('/api/items', { headers })
      .then(response => {
        console.log("INVENTORY- DM response:", response);
        setInventory(response.data.items); // Save all inventory items in state
        // setSortedInventory(inventory);
      })
      .catch(error => {
        console.error('Error loading inventory:', error.response.data);
      });
    }
  };

  useEffect(() => {
    console.log("INVENTORY PAGE- headers:", headers)
    fetchInventory();
  }, [headers]);

  // Runs fetchInventory when the socket message is received
  useEffect(() => {
    if (socket) {
      // Listen for 'items_updated' event
      socket.on('items_updated', fetchInventory);

      // Cleanup function to remove the event listener when component unmounts
      return () => {
        socket.off('items_updated');
      };
    }
  }, [socket, fetchInventory]);


  const [searchTerm, setSearchTerm] = useState('');

  /* Sorting Functionality */
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [sortedInventory, setSortedInventory] = useState([]);

  useEffect(() => {
    setSortedInventory(inventory);
  }, [inventory])

  const onSort = (key) => {
    let direction = 'ascending';
    key = key.toLowerCase();

    if (sortConfig.key === key) {
      if (sortConfig.direction === 'ascending') {
        direction = 'descending';
      } else if (sortConfig.direction === 'descending') {
        direction = null;
        key = null;
      }
    }
    // console.log("New sorting key is", key, direction);
    setSortConfig({ key, direction });
  };

  // Sort the inventory
  useEffect(() => {
    // console.log("Sorting inventory by key", sortConfig.key);

    let newSortedInventory = [...sortedInventory];
    newSortedInventory = sortedInventory.slice().sort((a, b) => {
      // Equipped items always come first
      if (a && a.equipped && b && !b.equipped) {
        return -1;
      }
      if (a && !a.equipped && b && b.equipped) {
        return 1;
      }
      if (sortConfig.key !== null && sortConfig.direction !== null) {
        if (sortConfig.key === "value") {
          const aValueInCopper = a.quantity * a.cost * currencyValues[a.currency];
          const bValueInCopper = b.quantity * b.cost * currencyValues[b.currency];
          if (aValueInCopper < bValueInCopper) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (aValueInCopper > bValueInCopper) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
        } else if (sortConfig.key === "cost") {
          const aValueInCopper = a.cost * currencyValues[a.currency];
          const bValueInCopper = b.cost * currencyValues[b.currency];

          if (aValueInCopper < bValueInCopper) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (aValueInCopper > bValueInCopper) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
        } else {
          // Handle sorting for other keys normally
          // console.log(a[sortConfig.key] + " vs " + b[sortConfig.key]);
          if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
        }
      }
      return 0;  // Important to return 0 if no sorting is done
    });

    if (sortConfig.key !== null && sortConfig.direction !== null) {
      setSortedInventory(newSortedInventory);
    } else {
      setSortedInventory(inventory);  // revert back to the unsorted inventory
    }

    // console.log("newSortedInventory:", newSortedInventory);
  }, [sortConfig, inventory]);


  // For when a player is given a new item
  useEffect(() => {
    if (socket) {
      socket.on('inventory_update', function(data) {
        // Update the player's inventory
        console.log('Inventory update:', data);
        console.log("Does " + data.character_name + " match " + characterName + "?", data.character_name === characterName);
        
        // Request the server to get the latest inventory
        axios.get('/api/inventory', { headers: headers })
        .then(response => {
            const updatedInventory = response.data.inventory;
            setInventory(updatedInventory);
            setSortedInventory(updatedInventory);
            // Handle the updated inventory here
            console.log('Updated Inventory:', updatedInventory);
        })
        .catch(error => {
            console.error('Error fetching inventory:', error);
        });
      });

      return () => {
        socket.off('inventory_update');
      };
    }
  }, [headers, socket]);


  const [inventoryItem, setInventoryItem] = useState(null);

  // Whenever the selected item changes, also update the inventory item
  useEffect(() => {
    setInventoryItem(selectedItem);
    console.log("selectedItem:", selectedItem);
  }, [selectedItem]);


  //*********** Make the Table Arrangeable ****************//
  const [columnOrder, setColumnOrder] = useState(['Name', 'Type', 'Cost', 'Quantity', 'Value', 'Description']);

  const [selectedColumns, setSelectedColumns] = useState(
    accountType === 'Player' ? {
      'Name': true,
      'Type': true,
      'Cost': false,
      'Quantity': true,
      'Value': true,
      'Description': true,
      'Weight': false
    } : {
      'Name': true,
      'Type': true,
      'Cost': true,
      'Description': true,
      'Weight': false
    }
  );


  // Updates the column order
  useEffect(() => {
    setColumnOrder(prevOrder => prevOrder.filter(column => selectedColumns[column]));
  }, [selectedColumns]);


  const moveColumn = (dragName, hoverName) => {
    const dragIndex = columnOrder.indexOf(dragName);
    const hoverIndex = columnOrder.indexOf(hoverName);
    const dragColumn = columnOrder[dragIndex];
    const newOrder = [...columnOrder];
    newOrder.splice(dragIndex, 1);
    newOrder.splice(hoverIndex, 0, dragColumn);
    setColumnOrder(newOrder);
  };

  function DraggableHeader({ id, onMoveColumn, onClick, children }) {
    const [{ isDragging }, drag] = useDrag({
      type: 'column',
      item: { id },
      collect: monitor => ({
        isDragging: !!monitor.isDragging(),
      }),
    })

    const [, drop] = useDrop({
      accept: 'column',
      hover(item) {
        if (item.id !== id) {
          onMoveColumn(id, item.id)
        }
      },
    })

    return (
      <th
        ref={node => drag(drop(node))}
        style={{ opacity: isDragging ? 0.5 : 1 }}
        onClick={onClick}
      >
        {children}
      </th>
    )
  }

  function SelectableRow({ item, columnOrder, selectedColumns, onClick }) {
    return (
      <tr
        style={{ opacity: 1 }}
        onClick={() => onClick()}
      >
        {columnOrder.filter(column => selectedColumns[column]).map((column) => (
          <td key={column}>{renderCell(item, column)}</td>
        ))}
      </tr>
    );
  }

  const handleColumnSelection = (column) => {
    setSelectedColumns(prevColumns => ({
      ...prevColumns,
      [column]: !prevColumns[column]
    }));

    setColumnOrder(prevOrder => {
      if (prevOrder.includes(column)) {
        // If the column is currently in the order, remove it
        return prevOrder.filter(col => col !== column);
      } else {
        // If the column is not in the order, add it
        return [...prevOrder, column];
      }
    });
  };

  // renders a cell when the columns have been moved
  function renderCell(item, columnKey) {
    if (selectedColumns[columnKey]) {
      switch (columnKey) {
        case 'Name':
          return item.name;
        case 'Type':
          return item.type;
        case 'Cost':
          return `${item.cost} ${item.currency}`;
        case 'Currency':
          return item.currency;
        case 'Quantity':
          return accountType === 'Player' ? item.quantity : null;
        case 'Value':
          return accountType === 'Player' ? `${item.cost * item.quantity} ${item.currency}` : null;
        case 'Description':
          return item.description;
        case 'Weight':
          return `${item.weight} pounds`;
        default:
          return null;
      }
    }
    return null;
  }


  /******* Adding Items from CSV ********/
  // When the user clicks "Upload CSV", either parse the file or create a blank item
  const parseCSV = () => {
    if (csvFile) {
      // CSV parsing logic
      Papa.parse(csvFile, {
        header: true,
        complete: function(results) {
          const data = results.data
          .map(item => {
            console.log("Current item:", item);
            // Remove all blank lines
            let newItem = {};
            for (let key in item) {
              let newKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
              if (newKey === 'Type') {
                newItem[newKey] = convertType(item[key]);
              } else if (newKey === 'Cost') {
                if (item[key] !== null) {
                  // let [cost, currency] = item[key].match(/^(\d+\.?\d*)\s*(\w*)$/).slice(1);
                  let [cost, currency] = item[key].split(' ');
                  newItem['Cost'] = parseInt(cost);
                  newItem['Currency'] = convertCurrencyAbbreviation(currency);
                } else {
                  console.error(`Item at line ${key} does not have a cost.`);
                  return null;
                }
              } else if (newKey === 'Weight') {
                console.log(item["Name"] + " weighs " + item[key] + " pounds");
                if (item[key] == 'N/A' || item[key]['Weight'] == 'NA' || item[key]['Weight'] == 'n/a' || item[key]['Weight'] == 'na' || item[key]['Weight'] == 'N/a' || item[key]['Weight'] == 'n/A' || item[key]['Weight'] == ' ' || item[key]['Weight'] == '') {
                  newItem['Weight'] = 0;
                } else {
                  // Convert the 'Weight' value to an integer
                  newItem["Weight"] = parseInt(item[key]);
                }
              } else if (newKey === 'AC') {
                // Convert the 'Armor Class' value to an integer
                newItem["AC"] = parseInt(item[key]);
              } else if (newKey === 'Stealth') {
                // Convert the 'Stealth' value to a boolean
                newItem[newKey] = (item[key].toUpperCase() === 'TRUE');
              } else if (newKey === 'Strength') {
                // Convert the 'Strength' value to an integer
                newItem[newKey] = parseInt(item[key]);
              } else if (newKey === 'Damage') {
                // Split the 'Damage' value into 'damage' and 'damageType'
                let [damage, damageType] = item[key].split(' ');
                newItem['Damage'] = damage;
                newItem['DamageType'] = damageType;
              } else if (newKey === 'Range') {
                // Convert the 'Range' value to an integer
                newItem[newKey] = parseInt(item[key]);
              } else if (newKey === 'Speed') {
                // Split the 'Speed' value into 'speed' and 'speedUnit'
                let [speed, speedUnit] = item[key].split(' ');
                newItem['Speed'] = parseInt(speed);
                newItem['Units'] = speedUnit;
              } else if (newKey === 'Capacity') {
                if (item['capacity'] == 'N/A' || item['capacity'] == 'NA' || item['capacity'] == 'n/a' || item['capacity'] == 'na' || item['capacity'] == 'N/a' || item['capacity'] == 'n/A' || item['capacity'] == ' ' || item['capacity'] == '') {
                  newItem[newKey] = 0;
                } else {
                  console.log(item["Name"] + " has a capacity of " + item[key]);
                  // Convert the 'capacity' value to an integer
                  newItem[newKey] = parseInt(item[key]);
                }
               } else {
                newItem[newKey] = item[key];
              }
            }
            return newItem;
          })
          .filter(item => item !== null && !isItemBlank(item));  // Filter out  blank items

          // Update state with the parsed items
          setUploadedItems(data);
          // Update fieldName with keys from the first item
          setFieldName(Object.keys(data[0]));
          // Close the upload modal and open the item review modal
          setShowUploadModal(false);
          setAddingItems(true);
        }
      });
    }
  };

  const convertType = (type) => {
    const types = ["Mount", "Vehicle", "Mounts", "Vehicles", "MountVehicle"];
    return types.includes(type) ? "Mounts and Vehicles" : type;
  };

  // Save items, removing the last blank item if it exists
  const handleSaveItems = () => {
    let itemsToSave = [...uploadedItems];

    // Check if the last item is blank and remove it if so
    const lastItem = itemsToSave[itemsToSave.length - 1];
    if (!Object.values(lastItem).some(value => value !== '')) {
      itemsToSave.pop();
    }

    axios.post('/api/save_items', { items: itemsToSave })
      .then(response => {
        // Handle the response
        // console.log("response:", response);
        // Close the item review modal
        setAddingItems(false);
        // Clear the uploaded items
        setUploadedItems([]);
        // Fetch the new inventory
        fetchInventory();
      })
      .catch(error => {
        // Handle the error
        console.error(error);
      });
  };

  const isItemBlank = (item) => {
    // We're assuming that an item is blank if all its fields, except 'Currency', are empty.
    // Modify this logic if your definition of a blank item is different.
    let blankFields = ['Name', 'Type', 'Cost', 'Description'];
    return blankFields.every(field => item[field] === '');
  };

  // Used to add a new line to the CSV Table
  const handleInputChange = (index, fieldName, value) => {
    // Create a new copy of the uploadedItems array
    let newUploadedItems = [...uploadedItems];

    // In your handleInputChange function
    if (fieldName === 'Stealth') {
      // If the field is 'Stealth', convert the value to a boolean
      newUploadedItems[index][fieldName] = (value === 'true');
    } else {
      newUploadedItems[index][fieldName] = value;
    }

    // If the item at the given index doesn't exist, create it
    if (!newUploadedItems[index]) {
      newUploadedItems[index] = {};
    }

    // Update the field of the item at the given index
    newUploadedItems[index][fieldName] = value;

    // Update the uploadedItems state
    setUploadedItems(newUploadedItems);
  };


  /******* Create a New Item ********/
  const createItem = async () => {
    try {
      let response;
      if (newItemType === 'Weapon') {
        console.log("** Creating weapon **");
        response = await axios.post('/api/items', {
          name: newItemName,
          type: newItemType,
          weight: newItemWeight,
          cost: newItemCost,
          currency: newItemCurrency,
          description: newItemDescription,
          damage: newItemDamage,
          damageType: newItemDamageType,
          weaponType: newItemWeaponType,
          weaponRange: newItemRange
        }, { headers: headers });
        console.log("Creating weapon:", response);
      } else if (newItemType === 'Armor') {
        console.log("** Creating armor **");
        response = await axios.post('/api/items', {
          name: newItemName,
          type: newItemType,
          weight: newItemWeight,
          cost: newItemCost,
          currency: newItemCurrency,
          description: newItemDescription,
          ac: newItemAC,
          armorType: newItemArmorType,
          stealthDisadvantage: newItemStealthDisadvantage,
          strengthNeeded: newItemStrengthNeeded,
        }, { headers: headers });
        console.log("Creating armor:", response);
      } else if (newItemType === 'MountVehicle') {
        console.log("** Creating MountVehicle **");
        response = await axios.post('/api/items', {
          name: newItemName,
          type: newItemType,
          weight: newItemWeight,
          cost: newItemCost,
          currency: newItemCurrency,
          description: newItemDescription,
          speed: newItemSpeed,
          speedUnit: newItemSpeedUnit,
          capacity: newItemCapacity
        }, { headers: headers });
        console.log("Creating Mount or Vehicle:", response);
      } else if (newItemType === 'Wand' || newItemType === 'Scroll') {
        console.log("** Creating Scroll/Ring/Wand **");
        response = await axios.post('/api/items', {
          name: newItemName,
          type: newItemType,
          weight: newItemWeight,
          cost: newItemCost,
          currency: newItemCurrency,
          description: newItemDescription,
          // spell: newItemSpell,
          charges: newItemCharges
        }, { headers: headers });
        console.log("Creating spell item:", response);
      } else {
        console.log("** Creating generic item **");
        response = await axios.post('/api/items', {
          name: newItemName,
          type: newItemType,
          weight: newItemWeight,
          cost: newItemCost,
          currency: newItemCurrency,
          description: newItemDescription
        }, { headers: headers });
        console.log("Creating item:", response);
      }

      setNewItemName('');
      setNewItemType('');
      setNewItemCost('');
      setNewItemCurrency('Gold');
      setNewItemWeight('');
      setNewItemDescription('');
      setNewItemDamage('');
      setNewItemDamageType('');
      setNewItemRange('');
      setNewItemAC('');
      setNewItemArmorType('');
      setNewItemStealthDisadvantage(false);
      setNewItemStrengthNeeded(null);
      setNewItemCapacity('');
      setNewItemSpeed('');
      setNewItemSpeedUnit('');
      setNewItemSpell('');
      setNewItemCharges('');

      // setInventory(prevInventory => [...prevInventory, response.data.item]);
      setCreatingItem(false);
      fetchInventory();
    } catch (error) {
      handleError('Error creating item:', error);
    }
  };

  function closeCreateModal() {
    setNewItemName('');
    setNewItemType('');
    setNewItemCost('');
    setNewItemCurrency('Gold');
    setNewItemDescription('');
    setNewItemWeight('');
    setNewItemDamage('');
    setNewItemDamageType('');
    setNewItemRange('');
    setNewItemAC('');
    setNewItemArmorType('');
    setNewItemStealthDisadvantage(false);
    setNewItemStrengthNeeded(null);
    setNewItemCapacity('');
    setNewItemSpeed('');
    setNewItemSpeedUnit('');
    setNewItemSpell('');
    setNewItemCharges('');

    setCreatingItem(false);
  }

  /******* Updating Item Details ********/
  // For changing an entire item
  const handleItemChange = (index, name, value) => {
    let newItems = [...uploadedItems];
    newItems[index][name] = value;

    if (index === uploadedItems.length - 1) {
      newItems.push({
        Name: '',
        Type: '',
        Cost: '',
        Currency: '',
        Description: ''
      });
    }

    setUploadedItems(newItems);
  };

  // For changing an item's details
  const handleSelectChange = (index, name, value) => {
    let updatedItems = [...uploadedItems];
    updatedItems[index][name] = value;
    setUploadedItems(updatedItems);
  }

  const convertCurrencyAbbreviation = (abbrev) => {
    if (abbrev) {
      switch (abbrev.toLowerCase()) {
        case 'cp':
          return 'Copper';
        case 'sp':
          return 'Silver';
        case 'ep':
          return 'Electrum';
        case 'gp':
          return 'Gold';
        case 'pp':
          return 'Platinum';
        default:
          // console.log("Returning default:", abbrev);
          return abbrev;
      }
    } else {
      console.error('Currency abbreviation', abbrev, 'is undefined.');
      return '';
    }
  };

  // Use it when displaying currency to user
  const fullCurrencyName = convertCurrencyAbbreviation(newItemCurrency);
  /**************************************/

  const handleItemSelection = (item) => {
    // console.log("INVENTORY- selectedItem being set:", item);
    setSelectedItem(item);
    fetchPlayers();
    setShowViewItemDetails(true);
    console.log('players:', players);
  };

  /*** Let Players Trade or Drop Items **/
  const giveItemToAnotherPlayer = useCallback(() => {
    console.log(`Giving item ${selectedItem.id} in quantity ${quantity} to ${selectedPlayer.character_name}.`);

    const messageObj = {
      type: 'item_transfer',
      sender: headers['username'],
      text: `${characterName} gave you ${quantity} ${selectedItem.name}`,
      recipients: [selectedPlayer],
      item: { ...selectedItem, quantity: quantity },
      campaignID: campaignID,
    };

    socket.emit('sendMessage', messageObj);
    setShowViewItemDetails(false);
  }, [ username, characterName, quantity, selectedItem, selectedPlayer, socket]);

  const dropItem = async (item, quantity) => {
    // console.log("INVENTORY- Dropping item:", item)
    // console.log("INVENTORY- Dropping item ID:", item.id)
    if (item && item.id) { // Check if item and its id exist.
      try {
        await axios.delete(`/api/inventory/${item.id}`, {
          headers,
          data: {
            quantity: quantity
          }
        });
        // Update the local inventory
        setInventory(prevInventory => {
          return prevInventory.map(i => {
            // Decrease the quantity of the dropped item
            if (i.id === item.id) {
              return {...i, quantity: i.quantity - quantity};
            }
            // Return other items unchanged
            return i;
          }).filter(i => i.quantity > 0); // Remove items with no quantity
        });
        setShowViewItemDetails(false);
      } catch (error) {
        handleError('Error dropping item:', error);
      }
    } else {
      console.error('item or item.id is not defined.');
    }
  };

  /********* Functions for DM ************/
  const issueItemToPlayer = () => {
    console.log("issueItemToPlayer- selectedPlayer:", selectedPlayer);
    console.log("issueItemToPlayer- selectedItem:", selectedItem);
    // console.log("issueItemToPlayer- Campaign ID:", headers['campaignID']);

    // Issue an item via messageObj
    const messageObj = {
      type: 'item_transfer',
      sender: headers['username'],
      text: `You received ${quantity} ${selectedItem.name}`,
      recipients: [selectedPlayer],
      campaignID: headers['campaignID'],
      item: { ...selectedItem, quantity: quantity },
    };

    console.log("Sending messageObj:", messageObj);

    socket.emit('sendMessage', messageObj);

    setShowViewItemDetails(false);
    setQuantity(1);
    // fetchInventory(); // Refetch inventory after issuing an item
  };

  const deleteItem = async (itemId) => {
    console.log("Deleting Item:", itemId);
    try {
      await axios.delete(`/api/items/${itemId}`, { headers: headers });
      setInventory(inventory.filter(item => item.id !== itemId));
      setShowEditItemDetails(false);
    } catch (error) {
      handleError('Error deleting item:', error);
    }
  };

  /**************************************/

  const handleCloseItemDetails = async () => {
    if (accountType === 'DM') {
      try {
        await axios.put(`/api/items/${selectedItem.id}`, selectedItem, { headers: headers });
        setInventory(inventory.map(item => item.id === selectedItem.id ? selectedItem : item));
      } catch (error) {
        handleError('Error updating item:', error);
      }
    } else if (accountType === 'Player') {
      // console.log("Player is updating item")
      try {
        await axios.put(`/api/inventory/${selectedItem.id}`, {
          name: selectedItem.name,
          equipped: selectedItem.equipped
        }, { headers: headers });
        setInventory(inventory.map(item => item.id === selectedItem.id ? selectedItem : item));
      } catch (error) {
        handleError('Error updating item:', error);
      }
    }
    setShowViewItemDetails(false);
    setShowEditItemDetails(false);
  };

  return (
    <Container>
      <Stack gap={3}>
        <h1>{characterName}'s Inventory</h1>
      
      {/* <div className="sticky-section-container">
        <div className="sticky-header"> */}
        <Stack>
          <Row>
            <Col sm={10}>
              <Form.Control
                type="search"
                placeholder="Search"
                onChange={event => setSearchTerm(event.target.value)}
              />
            </Col>
            <Col sm={2}>
              <Button variant="primary" onClick={() => setShowModal(true)}>
                <SortIcon />
              </Button>
            </Col>
          </Row>
          {accountType === 'DM' && (
            <Stack direction="horizontal" gap={3}>
              <Button onClick={() => setCreatingItem(true)}>Create Item</Button>
              <Button onClick={() => setShowUploadModal(true)}>Add Items</Button>
            </Stack>
          )}
        </Stack>
        <div style={{ maxHeight: '700px', overflowY: 'auto', minHeight: '50vh' }}>
          <DndProvider backend={HTML5Backend}>
            <Table striped bordered hover>
              <thead className="sticky-table-header">
                <tr>
                  {columnOrder.map((column, index) => (
                    <DraggableHeader
                      key={column}
                      id={column}
                      onMoveColumn={moveColumn}
                      onClick={() => onSort(column)}
                    >
                      {column}
                    </DraggableHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedInventory.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length}>You don't have anything in your inventory yet!</td>
                  </tr>
                ) : (
                  sortedInventory
                    .filter(item =>
                      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      item.type.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((item, index) => (
                      <SelectableRow
                        key={index}
                        item={item}
                        columnOrder={columnOrder}
                        selectedColumns={selectedColumns}
                        onClick={() => {
                          console.log("Row clicked");
                          handleItemSelection(item);
                        }}
                      />
                    ))
                )}
              </tbody>
            </Table>
          </DndProvider>
          </div>
        </Stack>
        

      {/* Choose Visible Columns Modal*/}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Select Columns</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {Object.entries(selectedColumns).map(([column, isSelected]) => (
            <Form.Check
              key={column}
              type="checkbox"
              label={column}
              checked={isSelected}
              onChange={() => handleColumnSelection(column)}
            />
          ))}
        </Modal.Body>
      </Modal>


      {/* Create New Item Modal */}
      <Modal show={creatingItem} onHide={closeCreateModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create Item</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Name & Type */}
          <Row>
            <Col>
              <label htmlFor="item-name">Item Name:</label>
              <input
              type="text"
              placeholder="Item Name"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
            />
            </Col>
            <Col>
              <label htmlFor="item-type">Item Type:</label>
              <select
                value={newItemType}
                onChange={e => setNewItemType(e.target.value)}
              >
                <option defaultValue="" disabled>Select item type</option>
                <option value="Armor">Armor</option>
                <option value="Weapon">Weapon</option>
                <option value="Potion">Potion</option>
                <option value="Scroll">Scroll</option>
                <option value="Wand">Wand</option>
                <option value="Ring">Ring</option>
                <option value="Rod">Rod</option>
                <option value="Staff">Staff</option>
                <option value="Wondrous Item">Wondrous Item</option>
                <option value="Adventuring Gear">Adventuring Gear</option>
                <option value="Tools">Tools</option>
                <option value="Mounts and Vehicles">Mounts and Vehicles</option>
                <option value="Trade Goods">Trade Goods</option>
                <option value="Treasure">Treasure</option>
              </select>
            </Col>
          </Row>
          {/* Weight */}
          <Row>
            <label htmlFor="item-weight">Weight:</label>
            <input
              type="number"
              placeholder="Item Weight"
              value={newItemWeight}
              onChange={e => setNewItemWeight(e.target.value)}
            />
          </Row>
          {/* Specific Details */}
          <Row>
            {newItemType === 'Mounts and Vehicles' && (
              <>
                <Col>
                  <label htmlFor="item-speed">Speed:</label>
                  <input
                    type="number"
                    placeholder="Speed"
                    value={newItemSpeed}
                    onChange={e => setNewItemSpeed(e.target.value)}
                  />
                </Col>
                <Col>
                  <select
                    value={newItemSpeedUnit}
                    onChange={e => setNewItemSpeedUnit(e.target.value)}
                  >
                    <option defaultValue="" disabled>Select units</option>
                    <option value="feet">Feet</option>
                    <option value="mph">Miles per hour</option>
                  </select>
                </Col>
                <Col>
                  <label htmlFor="item-capacity">Capacity:</label>
                  <input
                    type="number"
                    placeholder="Capacity"
                    value={newItemCapacity}
                    onChange={e => setNewItemCapacity(e.target.value)}
                  />
                </Col>
                <Col>
                  <label htmlFor="item-vehicle-type">Vehicle Type:</label>
                  <select
                    value={selectedItem?.vehicle_type}
                    onChange={e => setSelectedItem({ ...selectedItem, vehicle_type: e.target.value })}
                  >
                    <option defaultValue="" disabled>Select vehicle type</option>
                    <option value="Land">Land</option>
                    <option value="Sea">Sea</option>
                    <option value="Air">Air</option>
                  </select>
                </Col>
              </>
            )}
            {newItemType === 'Weapon' && (
              <>
                <Col>
                  <label htmlFor="item-weapon-proficiency">Weapon Proficiency:</label>
                  <select
                    value={newItemWeaponType}
                    onChange={e => setNewItemWeaponType(e.target.value)}
                  >
                    <option defaultValue="" disabled>Select weapon proficiency</option>
                    <option value="Simple Melee">Simple Melee</option>
                    <option value="Simple Ranged">Simple Ranged</option>
                    <option value="Martial Melee">Martial Melee</option>
                    <option value="Martial Ranged">Martial Ranged</option>
                  </select>
                </Col>
                <Col>
                  <label htmlFor="item-damage">Damage:</label>
                  <input
                    type="text"
                    placeholder="Damage"
                    value={newItemDamage}
                    onChange={e => setNewItemDamage(e.target.value)}
                  />
                </Col>
                <Col>
                  <select
                    value={newItemDamageType}
                    onChange={e => setNewItemDamageType(e.target.value)}
                  >
                    <option defaultValue="" disabled>Select damage type</option>
                    <option value="Acid">Acid</option>
                    <option value="Bludgeoning">Bludgeoning</option>
                    <option value="Cold">Cold</option>
                    <option value="Fire">Fire</option>
                    <option value="Force">Force</option>
                    <option value="Lightning">Lightning</option>
                    <option value="Necrotic">Necrotic</option>
                    <option value="Piercing">Piercing</option>
                    <option value="Poison">Poison</option>
                    <option value="Psychic">Psychic</option>
                    <option value="Radiant">Radiant</option>
                    <option value="Slashing">Slashing</option>
                    <option value="Thunder">Thunder</option>
                  </select>
                </Col>
                <label htmlFor="item-range">Weapon Range:</label>
                <input
                  type="number"
                  placeholder="Weapon Range- Enter 0 for melee"
                  value={newItemRange}
                  onChange={e => setNewItemRange(e.target.value)}
                />
              </>
            )}
            {newItemType === 'Armor' && (
              <>
                <Col>
                  <label htmlFor="item-armor-type">Armor Type:</label>
                  <select
                    value={newItemArmorType}
                    onChange={e => setNewItemArmorType(e.target.value)}
                  >
                    <option defaultValue="" disabled>Select armor type</option>
                    <option value="Light Armor">Light Armor</option>
                    <option value="Medium Armor">Medium Armor</option>
                    <option value="Heavy Armor">Heavy Armor</option>
                  </select>
                </Col>
                <Col>
                  <label htmlFor="item-ac">Armor Class:</label>
                  <input
                    type="number"
                    placeholder="Armor Class"
                    value={newItemAC}
                    onChange={e => setNewItemAC(e.target.value)}
                  />
                  {newItemArmorType === 'Light Armor' && ' + Dex Mod'}
                  {newItemArmorType === 'Medium Armor' && ' + Dex Mod (max 2)'}
                </Col>
                <Col>
                  <label>
                    <input
                      type="checkbox"
                      checked={newItemStealthDisadvantage}
                      onChange={e => setNewItemStealthDisadvantage(e.target.checked)}
                    />
                    Stealth Disadvantage
                  </label>
                </Col>
                <Col>
                  <label htmlFor="item-strength-needed">Strength Needed:</label>
                  <input
                    type="number"
                    placeholder="Strength Needed"
                    value={newItemStrengthNeeded}
                    onChange={e => setNewItemStrengthNeeded(e.target.value)}
                  />
                </Col>
              </>
            )}
          </Row>
          {/* Cost */}
          <Row>
            <Col>
              <label htmlFor="item-cost">Cost:</label>
              <input
                type="number"
                placeholder="Item Cost"
                value={newItemCost}
                onChange={e => setNewItemCost(e.target.value)}
              />
            </Col>
            <Col>
              <select
                value={newItemCurrency}
                onChange={e => setNewItemCurrency(e.target.value)}
              >
                <option defaultValue="" disabled>Select currency type</option>
                <option value="Copper">Copper</option>
                <option value="Silver">Silver</option>
                <option value="Electrum">Electrum</option>
                <option value="Gold">Gold</option>
                <option value="Platinum">Platinum</option>
              </select>
            </Col>
          </Row>
          {/* Description */}
          <Row>
            <label htmlFor="item-description">Description:</label>
            <textarea
              placeholder="Item Description"
              value={newItemDescription}
              onChange={e => setNewItemDescription(e.target.value)}
            />
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={createItem}>
            Add Item
          </Button>
        </Modal.Footer>
      </Modal>

      {/* File Upload Modal */}
      <Modal show={showUploadModal} onHide={() => setShowUploadModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Upload CSV</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <input
            type="file"
            accept=".csv"
            onChange={e => {
              const file = e.target.files[0];
              const fileType = file.name.split('.').pop().toLowerCase();
              if (fileType !== 'csv') {
                alert('Invalid file type. Please upload a CSV file.');
              } else {
                setCsvFile(file);
              }
            }}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={parseCSV}>
            Upload
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Multiple New Items via CSV */
      /* This Modal shows a table with the uploaded items in it for revision*/}
      <Modal show={addingItems} onHide={() => setAddingItems(false)} fullscreen={true}>
        <Modal.Header closeButton>
          <Modal.Title>Uploaded Items</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table striped bordered hover>
            <thead>
              <tr>
                {fieldName.map((name, i) => (
                  <th key={i}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
            {uploadedItems.map((item, index) => (
              <tr key={index}>
                {fieldName.map((name, j) => (
                  <td key={j}>
                    {name === "Type" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                      >
                        <option defaultValue="" disabled>Select item type</option>
                        <option value="Armor">Armor</option>
                        <option value="Weapon">Weapon</option>
                        <option value="Potion">Potion</option>
                        <option value="Scroll">Scroll</option>
                        <option value="Wand">Wand</option>
                        <option value="Ring">Ring</option>
                        <option value="Rod">Rod</option>
                        <option value="Staff">Staff</option>
                        <option value="Wondrous Item">Wondrous Item</option>
                        <option value="Adventuring Gear">Adventuring Gear</option>
                        <option value="Tools">Tools</option>
                        <option value="Mounts and Vehicles">Mounts and Vehicles</option>
                        <option value="Trade Goods">Trade Goods</option>
                        <option value="Treasure">Treasure</option>
                      </select>
                    ) : name === "Currency" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                      >
                        <option defaultValue="" disabled>Select Currency type</option>
                        <option value="Copper">Copper</option>
                        <option value="Silver">Silver</option>
                        <option value="Electrum">Electrum</option>
                        <option value="Gold">Gold</option>
                        <option value="Platinum">Platinum</option>
                      </select>

                    ) : name === "Units" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                        disabled={item["Type"] !== "Mounts and Vehicles"}
                      >
                        <option defaultValue="" disabled>Select units</option>
                        <option value="feet">Feet</option>
                        <option value="mph">Miles per hour</option>
                      </select>
                    ) : name === "Vehicle type" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                        disabled={item["Type"] !== "Mounts and Vehicles"}
                      >
                        <option defaultValue="" disabled>Select vehicle type</option>
                        <option value="Land">Land</option>
                        <option value="Water">Water</option>
                        <option value="Air">Air</option>
                      </select>
                    ) : name === "DamageType" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                        disabled={item["Type"] !== "Weapon"}
                      >
                        <option defaultValue="" disabled>Select damage type</option>
                        <option value="Acid">Acid</option>
                        <option value="Bludgeoning">Bludgeoning</option>
                        <option value="Cold">Cold</option>
                        <option value="Fire">Fire</option>
                        <option value="Force">Force</option>
                        <option value="Lightning">Lightning</option>
                        <option value="Necrotic">Necrotic</option>
                        <option value="Piercing">Piercing</option>
                        <option value="Poison">Poison</option>
                        <option value="Psychic">Psychic</option>
                        <option value="Radiant">Radiant</option>
                        <option value="Slashing">Slashing</option>
                        <option value="Thunder">Thunder</option>
                      </select>
                    ) : name === "Weapon type" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                        disabled={item["Type"] !== "Weapon"}
                      >
                        <option defaultValue="" disabled>Select weapon proficiency</option>
                        <option value="Simple Melee">Simple Melee</option>
                        <option value="Simple Ranged">Simple Ranged</option>
                        <option value="Martial Melee">Martial Melee</option>
                        <option value="Martial Ranged">Martial Ranged</option>
                      </select>
                    ) : name === "Armor type" ? (
                      <select
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                        disabled={item["Type"] !== "Armor"}
                      >
                        <option defaultValue="" disabled>Select armor type</option>
                        <option value="Light Armor">Light Armor</option>
                        <option value="Medium Armor">Medium Armor</option>
                        <option value="Heavy Armor">Heavy Armor</option>
                      </select>
                    ) : name === "Stealth" ? (
                      <input
                        type="checkbox"
                        checked={item[name]}
                        value={item[name]}
                        onChange={e => handleSelectChange(index, name, e.target.value)}
                        disabled={item["Type"] !== "Armor"}
                      />
                    ) : (
                      <input
                        type="text"
                        value={item[name]}
                        onChange={e => handleItemChange(index, name, e.target.value)}
                        disabled={
                          !alwaysEnabledFields.includes(name) &&
                          !(typeFields[item["Type"]] && typeFields[item["Type"]].includes(name))
                        }
                      />)
                    }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handleSaveItems}>Save Items</Button>
        </Modal.Footer>
      </Modal>

      {/* View ItemDetails Modal */}
      <Modal show={showViewItemDetails} onHide={handleCloseItemDetails} centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title >
            <Col>
              <Form.Control
                type="text"
                value={selectedItem?.name}
                onChange={e => setSelectedItem({ ...selectedItem, name: e.target.value })}
              />
            </Col>
            <Col>
              {accountType === 'DM' && (
                <Button variant="primary" onClick={() => {
                  setShowEditItemDetails(true);
                  setShowViewItemDetails(false);
                }}>
                  <EditIcon />
                </Button>
              )}
              {accountType === 'Player' && (
                <Form.Check
                  key={'equip-checkbox'}
                  type="checkbox"
                  label={
                    <span style={{ fontSize: '1rem', color: selectedItem?.equipped ? 'green' : 'red' }}>
                      {selectedItem?.equipped ? 'Equipped!' : 'Equip?'}
                    </span>
                  }
                  checked={selectedItem?.equipped}
                  onChange={e => setSelectedItem({ ...selectedItem, equipped: !selectedItem?.equipped })}
                />
              )}
            </Col>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Container>
            <Row>
              <Col>{selectedItem?.type}</Col>
              <Col className="text-right">{selectedItem?.cost} {selectedItem?.currency}</Col>
            </Row>
            <Row>
            <Col>Weight: {selectedItem?.weight} {selectedItem?.weight === null ? '' : 'pound'}{selectedItem?.weight > 1 ? 's' : ''}</Col>
            </Row>
            <Row>
            {accountType === 'Player' && (
              <Col>Quantity: {selectedItem?.quantity}</Col>
            )}
            </Row>
            <Row>
              {selectedItem?.type === 'Mounts and Vehicles' && (
                <>
                  <Col>Vehicle Type: {selectedItem?.vehicle_type}</Col>
                  <Col>Speed: {selectedItem?.speed}</Col>
                  <Col>Capacity: {selectedItem?.capacity}</Col>
                </>
              )}
              {selectedItem?.type === 'Weapon' && (
                <>
                  <Col>Type: {selectedItem?.weapon_type}</Col>
                  <Col>Damage: {selectedItem?.damage} {selectedItem?.damage_type}</Col>
                  <Col>Range: {selectedItem?.weapon_range} feet</Col>
                </>
              )}
              {selectedItem?.type === 'Armor' && (
              <>
                <Row>
                  AC: {selectedItem?.armor_class}
                  {selectedItem?.armor_type === 'Light Armor' && ' + Dex Mod'}
                  {selectedItem?.armor_type === 'Medium Armor' && ' + Dex Mod (max 2)'}
                </Row>
                <Row>
                  Type: {selectedItem?.armor_type}
                </Row>
                <Row>
                  {selectedItem?.strength_needed === null ? '' : `Strength Needed: ${selectedItem?.strength_needed}`}
                </Row>
                <Row>Stealth Disadvantage: {selectedItem?.stealthDisadvantage ? "Yes" : "No"}</Row>
              </>
            )}
            </Row>
            <Row>
              <Col>Description: {selectedItem?.description}</Col>
            </Row>
          </Container>
        </Modal.Body>
        <Modal.Footer>
          <select
            defaultValue=""
            onChange={e => {
              const playerIndex = e.target.value;
              if (playerIndex !== "") {
                setSelectedPlayer(players[playerIndex]);
              } else {
                setSelectedPlayer(null);  // Or some default value
              }
            }}
            >
            <option value="" disabled>Select a player</option>
            {players.map((player, index) => (
              <option key={index} value={index}>{player.character_name}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Quantity"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
          {accountType === 'DM' && (
            <Row>
              <Button variant="primary" onClick={issueItemToPlayer}>
                Issue to Player
              </Button>
            </Row>
          )}
          {accountType === 'Player' && (
            <>
              <Row>
                <Button variant="primary" onClick={giveItemToAnotherPlayer}>
                  Give to Teammate
                </Button>
              </Row>
              <Row>
                <Button variant="danger" onClick={() => dropItem(selectedItem, quantity)}>
                  Drop Item
                </Button>
              </Row>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Edit ItemDetails Modal */}
      <Modal show={showEditItemDetails} onHide={handleCloseItemDetails} centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>
            <Col>
              <label htmlFor="item-name">Item Name:</label>
            </Col>
            <Col>
              <Form.Control
                type="text"
                value={selectedItem?.name}
                onChange={e => setSelectedItem({ ...selectedItem, name: e.target.value })}
              />
            </Col>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Container>
            <Row>
              <Col>
                <label htmlFor="item-type">Type:</label>
                <select
                  value={selectedItem?.type}
                  onChange={e => setSelectedItem({ ...selectedItem, type: e.target.value })}
                >
                  <option defaultValue="" disabled>Select item type</option>
                  <option value="Armor">Armor</option>
                  <option value="Weapon">Weapon</option>
                  <option value="Potion">Potion</option>
                  <option value="Scroll">Scroll</option>
                  <option value="Wand">Wand</option>
                  <option value="Ring">Ring</option>
                  <option value="Rod">Rod</option>
                  <option value="Staff">Staff</option>
                  <option value="Wondrous Item">Wondrous Item</option>
                  <option value="Adventuring Gear">Adventuring Gear</option>
                  <option value="Tools">Tools</option>
                  <option value="Mounts and Vehicles">Mounts and Vehicles</option>
                  <option value="Trade Goods">Trade Goods</option>
                  <option value="Treasure">Treasure</option>
                </select>
              </Col>
              <Col className="text-right">
                <>
                  <label htmlFor="item-cost">Cost:</label>
                  <Form.Control
                    type="number"
                    value={selectedItem?.cost}
                    onChange={e => setSelectedItem({ ...selectedItem, cost: e.target.value })}
                  />
                  <select
                    value={selectedItem?.currency}
                    onChange={e => setSelectedItem({ ...selectedItem, currency: e.target.value })}
                  >
                    <option value="Copper">Copper</option>
                    <option value="Silver">Silver</option>
                    <option value="Electrum">Electrum</option>
                    <option value="Gold">Gold</option>
                    <option value="Platinum">Platinum</option>
                  </select>
                </>
              </Col>
            </Row>
            <Row>
              <Col>
                <label htmlFor="item-weight">Weight:</label>
                <input
                  type="number"
                  placeholder="Item Weight"
                  value={selectedItem?.weight}
                  onChange={e => setSelectedItem({ ...selectedItem, weight: e.target.value })}
                />
                <label htmlFor="DexMod">{selectedItem?.armor_type === 'Light Armor' && ' + Dex Mod'}
                {selectedItem?.armor_type === 'Medium Armor' && ' + Dex Mod (max 2)'}</label>
              </Col>
              <Col>
                {selectedItem?.type === 'Mounts and Vehicles' && (
                  <>
                    <label htmlFor="item-vehicle-type">Vehicle Type:</label>
                    <select
                      value={selectedItem?.vehicle_type}
                      onChange={e => setSelectedItem({ ...selectedItem, vehicle_type: e.target.value })}
                    >
                      <option defaultValue="" disabled>Select vehicle type</option>
                      <option value="Land">Land</option>
                      <option value="Sea">Sea</option>
                      <option value="Air">Air</option>
                    </select>
                    <label htmlFor="item-speed">Speed:</label>
                    <input
                      type="number"
                      placeholder="Speed"
                      value={selectedItem?.speed}
                      onChange={e => setSelectedItem({ ...selectedItem, speed: e.target.value})}
                    />
                    <label htmlFor="item-capacity">Capacity:</label>
                    <input
                      type="number"
                      placeholder="Capacity"
                      value={selectedItem?.capacity}
                      onChange={e => setSelectedItem({ ...selectedItem, capacity: e.target.value})}
                    />
                  </>
                )}
                {selectedItem?.type === 'Weapon' && (
                  <>
                    <label htmlFor="item-weapon-proficiency">Weapon Proficiency:</label>
                    <select

                      value={selectedItem?.weapon_type}
                      onChange={e => setSelectedItem({ ...selectedItem, weapon_type: e.target.value })}
                    >
                      <option defaultValue="" disabled>Select weapon proficiency</option>
                      <option value="Simple Melee">Simple Melee</option>
                      <option value="Simple Ranged">Simple Ranged</option>
                      <option value="Martial Melee">Martial Melee</option>
                      <option value="Martial Ranged">Martial Ranged</option>
                    </select>
                    <label htmlFor="item-damage">Damage:</label>
                    <Form.Control
                      type="text"
                      value={selectedItem?.damage}
                      onChange={e => setSelectedItem({ ...selectedItem, damage: e.target.value })}
                    />
                    <select
                      value={selectedItem?.damage_type}
                      onChange={e => setNewItemDamageType(e.target.value)}
                    >
                      <option defaultValue="" disabled>Select damage type</option>
                      <option value="Acid">Acid</option>
                      <option value="Bludgeoning">Bludgeoning</option>
                      <option value="Cold">Cold</option>
                      <option value="Fire">Fire</option>
                      <option value="Force">Force</option>
                      <option value="Lightning">Lightning</option>
                      <option value="Necrotic">Necrotic</option>
                      <option value="Piercing">Piercing</option>
                      <option value="Poison">Poison</option>
                      <option value="Psychic">Psychic</option>
                      <option value="Radiant">Radiant</option>
                      <option value="Slashing">Slashing</option>
                      <option value="Thunder">Thunder</option>
                    </select>
                    <label htmlFor="item-range">Weapon Range:</label>
                    <Form.Control
                      type="number"
                      value={selectedItem?.weapon_range}
                      onChange={e => setSelectedItem({ ...selectedItem, range: e.target.value })}
                    />
                  </>
                )}
                {selectedItem?.type === 'Armor' && (
                  <>
                    <label htmlFor="item-armor-class">Armor Class:</label>
                    <input
                      type="number"
                      placeholder="Armor Class"
                      value={selectedItem?.armor_class}
                      onChange={e => setSelectedItem({ ...selectedItem, armor_class: e.target.value })}
                    />
                    <label htmlFor="item-armor-type">Armor Type:</label>
                    <select
                      value={selectedItem?.armor_type}
                      onChange={e => setSelectedItem({ ...selectedItem, armor_type: e.target.value })}
                    >
                      <option defaultValue="" disabled>Select armor type</option>
                      <option value="Light Armor">Light Armor</option>
                      <option value="Medium Armor">Medium Armor</option>
                      <option value="Heavy Armor">Heavy Armor</option>
                    </select>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedItem?.stealth_disadvantage}
                        onChange={e => setSelectedItem({ ...selectedItem, stealth_disadvantage: e.target.checked })}
                      />
                      Disadvantage to Stealth
                    </label>
                  </>
                )}
              </Col>
              <label htmlFor="item-description">Description:</label>
              <Form.Control
                as="textarea"
                value={selectedItem?.description}
                onChange={e => setSelectedItem({ ...selectedItem, description: e.target.value })}
              />
            </Row>
          </Container>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => handleCloseItemDetails(selectedItem.id)}>
            Save
          </Button>
          <Button variant="danger" onClick={() => deleteItem(selectedItem.id)}>
            <DeleteIcon />
          </Button>
        </Modal.Footer>
      </Modal>
      <ToastContainer />
    </Container>
  );
}
