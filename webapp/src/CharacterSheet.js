import React, { useState, useEffect, useRef } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { Row, Col, Button, ButtonGroup, Modal, ModalDialog, Form, Table, Placeholder } from 'react-bootstrap';
import { Paper } from '@mui/material';

import axios from 'axios';  // Makes API calls

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './CharacterSheet.css'

import EditIcon from '@mui/icons-material/Edit';

const ResponsiveGridLayout = WidthProvider(Responsive);

// A mapping of skills to their associated abilities
const skillAbilities = {
  'Acrobatics': 'dexterity',
  'Animal Handling': 'wisdom',
  'Arcana': 'intelligence',
  'Athletics': 'strength','Deception': 'charisma',
  'History': 'intelligence',
  'Insight': 'wisdom',
  'Intimidation': 'charisma',
  'Investigation': 'intelligence',
  'Medicine': 'wisdom',
  'Nature': 'intelligence',
  'Perception': 'wisdom',
  'Performance': 'charisma',
  'Persuasion': 'charisma',
  'Religion': 'intelligence',
  'Sleight of Hand': 'dexterity',
  'Stealth': 'dexterity',
  'Survival': 'wisdom'
};

const tiles = [
  { "w": 2, "h": 4, "x": 0, "y": 0, "i": "Name" },
  { "w": 2, "h": 4, "x": 2, "y": 0, "i": "Class" },
  { "w": 1, "h": 3, "x": 2, "y": 3, "i": "Race" },
  { "w": 1, "h": 4, "x": 3, "y": 0, "i": "Alignment" },
  { "w": 1, "h": 20, "x": 0, "y": 4, "i": "Ability Scores" },
  { "w": 1, "h": 3, "x": 1, "y": 4, "i": "Proficiency Bonus" },
  { "w": 1, "h": 12, "x": 1, "y": 7, "i": "Saving Throws" },
  { "w": 2, "h": 19, "x": 3, "y": 14, "i": "Skills" },
  { "w": 2, "h": 4, "x": 3, "y": 38, "i": "Personality Traits" },
  { "w": 2, "h": 4, "x": 1, "y": 31, "i": "Ideals" },
  { "w": 2, "h": 4, "x": 1, "y": 35, "i": "Bonds" },
  { "w": 2, "h": 5, "x": 3, "y": 33, "i": "Flaws" },
  { "w": 2, "h": 9, "x": 5, "y": 0, "i": "Feats" },
  { "w": 2, "h": 11, "x": 5, "y": 16, "i": "Attacks" },
  { "w": 2, "h": 13, "x": 5, "y": 27, "i": "Actions" },
  { "w": 2, "h": 7, "x": 5, "y": 40, "i": "Spells" },
  { "w": 2, "h": 7, "x": 5, "y": 9, "i": "Equipment" },
  { "w": 2, "h": 12, "x": 1, "y": 19, "i": "Proficiencies" },
  { "w": 1, "h": 7, "x": 2, "y": 12, "i": "Wealth" },
  { "w": 1, "h": 3, "x": 3, "y": 8, "i": "Initiative" },
  { "w": 1, "h": 3, "x": 4, "y": 4, "i": "Speed" },
  { "w": 1, "h": 3, "x": 2, "y": 6, "i": "Armor Class" },
  { "w": 1, "h": 3, "x": 3, "y": 4, "i": "Background" },
  { "w": 1, "h": 4, "x": 4, "y": 0, "i": "XP" },
  { "w": 1, "h": 4, "x": 4, "y": 10, "i": "Passive Perception" },
  { "w": 1, "h": 3, "x": 2, "y": 9, "i": "Max HP" },
  { "w": 1, "h": 3, "x": 3, "y": 11, "i": "Current HP" },
  { "w": 1, "h": 3, "x": 4, "y": 7, "i": "Temporary HP" }
]

const defaultLayout = {
  lg: tiles,
  md: tiles,
  sm: tiles,
  xs: tiles,
  xxs: tiles,
};

function CharacterSheet({ headers, characterName, setCharacterName }) {
  const [loading, setLoading] = useState(true);
  const [editingTileId, setEditingTileId] = useState(null);
  const [isModalShown, setIsModalShown] = useState(false);
  // const [layout, setLayout] = useState(null);
  const [layout, setLayout] = useState({ tiles });
  const [characters, setCharacters] = useState([]);

  const [playerClasses, setPlayerClasses] = useState([]);
  const [playerRaces, setPlayerRaces] = useState([]);
  const alignments = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];
  const [hitPoints, setHitPoints] = useState({ base: 0, level_increment: 0 });
  const [subclassOptions, setSubclassOptions] = useState([]);

  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [weapons, setWeapons] = useState([]);
  const [preparedSpells, setPreparedSpells] = useState([]);

  // Track previous values to detect changes in class/subclass/race
  const prevClassRef = useRef(null);
  const prevSubclassRef = useRef(null);
  const prevRaceRef = useRef(null);

  // Fetch all available characters
  const fetchAllCharacters = () => {
    axios.get('/api/campaign_characters', { headers })
      .then(response => {
        // Accept any of the possible name keys from the API
        const names = Array.isArray(response.data)
          ? response.data.map(c => c.Name || c.name || c.character_name || c)
          : [];
        const uniq = [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
        setCharacters(uniq);
        console.log('Fetched all characters:', uniq);
      })
      .catch(error => {
        console.error('Error fetching characters:', error);
      });
  };

  const loadCharacter = (nameToLoad) => {
    if (!nameToLoad) return;
    setLoading(true);

    // Use a character-specific header for dependent endpoints (equipment/spells)
    const characterHeaders = { ...headers, CharacterName: nameToLoad };

    return Promise.all([
      axios.get('/api/character_by_name', { headers, params: { name: nameToLoad } }),
      axios.get('/api/equipment', { headers: characterHeaders }),
      axios.get('/api/prepared_spells', { headers: characterHeaders })
    ])
      .then(([characterResponse, equipmentResponse, spellsResponse]) => {
        const {
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
          cp,
          sp,
          ep,
          gp,
          pp,
          Proficiencies,
          Subclass,
          ...rest
        } = characterResponse.data;

        const abilityScores = {
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
        };

        const Wealth = {
          cp,
          sp,
          ep,
          gp,
          pp,
        };

        setCharacter(prev => ({
          ...prev,
          ...rest,
          id: characterResponse.data.id,  // Track character ID for saves
          Name: nameToLoad,
          abilityScores,
          Wealth,
          Proficiencies,
          Subclass,
          Equipment: equipmentResponse?.data?.equipment ?? prev.Equipment,
          Spells: spellsResponse?.data?.spells ?? prev.Spells,
        }));
      })
      .catch(error => {
        console.error('Error loading character:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Switch to a different character: save current changes, then load new character
  const switchCharacter = (newCharacterName) => {
    if (newCharacterName === character.Name) return; // No-op if same character

    // Save current character before switching
    saveCharacter();

    // Update parent so other pages (inventory/journal) display the selected name
    if (setCharacterName) {
      setCharacterName(newCharacterName);
    }

    // Load the selected character into local state only (no parent updates)
    loadCharacter(newCharacterName);
  };

  const fetchPlayerClasses = () => {
    const campaignHeader = headers?.campaignID || headers?.CampaignID;
    if (!campaignHeader) {
      console.warn('Skipping class fetch: missing CampaignID header');
      return;
    }

    const systemHeader = headers?.System || 'D&D 5e';
    const requestHeaders = { ...headers, System: systemHeader };
    const requestParams = { system: systemHeader };

    axios.get(`/api/classes`, { headers: requestHeaders, params: requestParams })
      .then(response => {
        // API returns GameElement objects; extract the 'name' field for the dropdown
        const names = Array.isArray(response.data) ? response.data.map(c => c.name || c) : [];
        const uniq = [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
        setPlayerClasses(uniq);
        console.log("Fetched player classes:", uniq);
      })
      .catch(error => {
        console.error('Error fetching player classes at /api/classes:', error);
      });
  };

  const fetchPlayerRaces = () => {
    const campaignHeader = headers?.campaignID || headers?.CampaignID;
    if (!campaignHeader) {
      console.warn('Skipping race fetch: missing CampaignID header');
      return;
    }

    const systemHeader = headers?.System || 'D&D 5e';
    const requestHeaders = { ...headers, System: systemHeader };
    const requestParams = { system: systemHeader };

    axios.get(`/api/races`, { headers: requestHeaders, params: requestParams })
      .then(response => {
        const names = Array.isArray(response.data) ? response.data.map(r => r.name || r) : [];
        const uniq = [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
        setPlayerRaces(uniq);
        console.log("Fetched player races:", uniq);
      })
      .catch(error => {
        console.error('Error fetching player races:', error);
      });
  };

  // Fetch class/race listings and all characters once headers (CampaignID) are available
  useEffect(() => {
    fetchPlayerClasses();
    fetchPlayerRaces();
    fetchAllCharacters();
  }, [headers?.campaignID, headers?.CampaignID]);

  const getLayouts = () => {
    const savedLayout = localStorage.getItem('tileLayout');

    return savedLayout ? JSON.parse(savedLayout) : defaultLayout;
  };

  // Save layout presets to local storage
  const saveLayoutPresets = (presets) => {
    localStorage.setItem('layoutPresets', JSON.stringify(presets));
  };

  // Retrieve layout presets from local storage
  const getLayoutPresets = () => {
    const savedPresets = localStorage.getItem('layoutPresets');
    return savedPresets ? JSON.parse(savedPresets) : [];
  };

  // Declare a new state variable to store the character data
  const [character, setCharacter] = useState({
    id: null,  // Track character ID for saves
    Name: characterName || '',
    Class: null,
    Subclass: null,
    Level: 1,
    ExperiencePoints: 0,
    Background: null,
    Race: null,
    Alignment: null,
    
    abilityScores: {
      Strength: 0,
      Dexterity: 0,
      Constitution: 0,
      Intelligence: 0,
      Wisdom: 0,
      Charisma: 0,
    },
    proficiencyBonus: 2,  // Determined by level
    SavingThrows: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },    // Calculated by modifiers
    Skills: {
      Acrobatics: 0,
      'Animal Handling': 0,
      Arcana: 0,
      Athletics: 0,
      Deception: 0,
      History: 0,
      Insight: 0,
      Intimidation: 0,
      Investigation: 0,
      Medicine: 0,
      Nature: 0,
      Perception: 0,
      Performance: 0,
      Persuasion: 0,
      Religion: 0,
      'Sleight of Hand': 0,
      Stealth: 0,
      Survival: 0
    },          // Calculated by proficiencies & modifiers
    PassivePerception: 0, // wisdom modifier + proficiency bonus
    Proficiencies: [''],   // Determined by class and race

    ArmorClass: 10, // 10 + Dex Mod, if unarmored. Otherwise use equipment list
    Initiative: 1, // Determined by Dex
    Speed: 30, // Determined by Race
    HitPointMax: 0,  // Determined by Con mod & class
    CurrentHitPoints: 0,
    TemporaryHitPoints: 0,   // These deplete over time?
    Attacks: [''],  // Pre-populate with the generic actions, then list equipped weapons and spells
    Spells: [''], // List of prepared spells. The edit modal lists all available spells?
    Wealth: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0
    },
    Equipment: [''], // Lists items that the player has equipped

    PersonalityTraits: '',
    Ideals: '',
    Bonds: '',
    Flaws: '',
    Feats: [''],  // mostly determined by class? also race?

    Actions: [''], // List of actions the player can take
    Attacks: [''], // List of attacks the player can make
  });

  // Track per-currency add/spend amounts as objects so we can compute change correctly
  const [addAmount, setAddAmount] = useState({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  const [spendAmount, setSpendAmount] = useState({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });

  // Log when addAmount or spendAmount changes
  useEffect(() => {
    console.log("Add Amount:", addAmount);
  }, [addAmount]);
  useEffect(() => {
    console.log("Spend Amount:", spendAmount);
  }, [spendAmount]);

  // Functions to handle character wealth management
  const handleAddAmount = (currency, value) => {
    setAddAmount({ ...addAmount, [currency]: parseInt(value, 10) || 0 });
  };
  const handleSpendAmount = (currency, value) => {
    setSpendAmount({ ...spendAmount, [currency]: parseInt(value, 10) || 0 });
  };

  const handleWealthUpdate = (e) => {
    e.preventDefault();
  
    const conversionRates = {
      pp: 1000,
      gp: 100,
      ep: 50,
      sp: 10,
      cp: 1
    };
  
    const newWealth = { ...character.Wealth };
    console.log("Current Character Wealth:", newWealth);
  
    // Apply addAmount entries before computing spend so adds can be used to make change
    for (const currency of Object.keys(addAmount)) {
      const addVal = parseInt(addAmount[currency], 10) || 0;
      newWealth[currency] = (parseInt(newWealth[currency], 10) || 0) + addVal;
    }

    // Apply spending by following the rule set requested:
    // 1) If sufficient in same denom, subtract and do not change other denominations.
    // 2) Else, if sufficient in smaller denominations only, take from them (largest smaller first).
    // 3) Else, break larger denominations as needed (providing change back) combined with smaller if necessary.
    // If none of these can cover the spend, abort with "Insufficient funds".

    const denomOrder = ['pp','gp','ep','sp','cp']; // largest -> smallest

    const idxOf = (d) => denomOrder.indexOf(d);
    const smallerOf = (d) => denomOrder.slice(idxOf(d) + 1); // smaller denominations
    const largerOf = (d) => denomOrder.slice(0, idxOf(d)); // larger denominations (largest->closest)

    // Work on a temp wealth object so we can abort on insufficient funds
    const tempWealth = { ...newWealth };

    for (const currency of Object.keys(spendAmount)) {
      const coinsToSpend = parseInt(spendAmount[currency], 10) || 0;
      if (coinsToSpend <= 0) continue;
      const neededCp = coinsToSpend * conversionRates[currency];

      // Option 1: same denom
      const availableSame = parseInt(tempWealth[currency], 10) || 0;
      if (availableSame >= coinsToSpend) {
        tempWealth[currency] = availableSame - coinsToSpend;
        console.log(`Wealth Update - used ${coinsToSpend} ${currency} directly`);
        continue;
      }

      // Option 2: smaller denominations only
      const smaller = smallerOf(currency);
      let totalSmallCp = 0;
      for (const s of smaller) totalSmallCp += (parseInt(tempWealth[s], 10) || 0) * conversionRates[s];
      if (totalSmallCp >= neededCp) {
        // consume from smaller denominations, largest smaller first
        let remainingCp = neededCp;
        for (const donor of smaller) {
          if (remainingCp <= 0) break;
          const rate = conversionRates[donor];
          const avail = parseInt(tempWealth[donor], 10) || 0;
          if (avail <= 0) continue;
          const take = Math.min(avail, Math.ceil(remainingCp / rate));
          tempWealth[donor] = avail - take;
          remainingCp -= take * rate;
          console.log(`Wealth Update - took ${take} ${donor} from smaller to cover ${currency} spend, remainingCp=${remainingCp}`);
        }
        continue;
      }

      // Option 3: combine smaller + breaking larger denominations
      const larger = largerOf(currency);
      let totalLargeCp = 0;
      for (const L of larger) totalLargeCp += (parseInt(tempWealth[L], 10) || 0) * conversionRates[L];
      if (totalSmallCp + totalLargeCp >= neededCp) {
        // First consume all smaller as far as possible
        let remainingCp = neededCp;
        for (const donor of smaller) {
          if (remainingCp <= 0) break;
          const rate = conversionRates[donor];
          const avail = parseInt(tempWealth[donor], 10) || 0;
          const take = Math.min(avail, Math.ceil(remainingCp / rate));
          tempWealth[donor] = avail - take;
          remainingCp -= take * rate;
          console.log(`Wealth Update - used ${take} ${donor} (smaller) for ${currency} spend, remainingCp=${remainingCp}`);
        }

        // If still need cp, break larger denominations, starting from the smallest larger (closest above target)
        if (remainingCp > 0) {
          const largerSmallestFirst = [...larger].reverse();
          let changeBuffer = 0; // cp obtained from breaking larger coins
          for (const donor of largerSmallestFirst) {
            if (remainingCp <= 0) break;
            const rate = conversionRates[donor];
            let avail = parseInt(tempWealth[donor], 10) || 0;
            while (avail > 0 && remainingCp > 0) {
              // break one coin
              avail -= 1;
              tempWealth[donor] = avail;
              changeBuffer += rate;
              // use from buffer
              const used = Math.min(changeBuffer, remainingCp);
              changeBuffer -= used;
              remainingCp -= used;
              console.log(`Wealth Update - broke 1 ${donor}, used ${used}cp from buffer, remainingCp=${remainingCp}, buffer=${changeBuffer}`);
            }
          }

          // Any leftover change in buffer should be converted back into denominations (largest->smallest)
          if (changeBuffer > 0) {
            for (const d of denomOrder) {
              const rate = conversionRates[d];
              const add = Math.floor(changeBuffer / rate);
              if (add > 0) {
                tempWealth[d] = (parseInt(tempWealth[d], 10) || 0) + add;
                changeBuffer -= add * rate;
              }
            }
            console.log(`Wealth Update - returned change buffer as coins, leftover buffer=${changeBuffer}`);
          }
        }
        continue;
      }

      // If we reach here, insufficient funds for this particular spend
      alert('Insufficient funds');
      return;
    }

    console.log('Wealth Update - final tempWealth after all spends:', tempWealth);
    // Persist the changes
    setCharacter(prevState => ({ ...prevState, Wealth: tempWealth }));
    setAddAmount({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    setSpendAmount({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    setIsModalShown(false);
    console.log('Wealth Update - invoking saveCharacter with Wealth:', tempWealth);
    saveCharacter({ ...character, Wealth: tempWealth });
  };

  // Get Equipped items from Inventory & prepared spells from Spellbook
  useEffect(() => {
    // Only auto-fetch for the currently active character context.
    // Character switching explicitly loads equipment/spells via loadCharacter().
    if (headers?.CharacterName && character.Name && headers.CharacterName !== character.Name) {
      return;
    }

    axios.get('/api/equipment', { headers })
      .then(response => {
        console.log("Equipped items from Flask- response.data:", response.data);
        setCharacter(prevState => ({
          ...prevState,
          Equipment: response.data.equipment
        }));
      })
      .catch(error => {
        console.error(error);
      });

    axios.get('/api/prepared_spells', { headers })
      .then(response => {
        console.log("Prepared spells from Flask- response.data:", response.data);
        setCharacter(prevState => ({
          ...prevState,
          Spells: response.data.spells
        }));
      })
      .catch(error => {
        console.error("Error fetching prepared spells:", error);
      });
  }, [headers, character.Name]);

  // Determine Attacks based on equipped weapons
  useEffect(() => {
    if (character.Equipment) {
      const weapons = character.Equipment.filter(item => item.type === 'Weapon');
      console.log(`Weapons: ${weapons}`);
      setCharacter(prevState => ({
        ...prevState,
        Attacks: weapons,
      }));
    }
  }, [character.Equipment]);

  // Fetch the character data from the server when the component mounts
  useEffect(() => {
    // If the page was opened with a specific characterName, load it explicitly.
    // Otherwise fall back to the backend's "current character" resolution.
    if (characterName) {
      loadCharacter(characterName);
      return;
    }

    console.log("character.Name:", character.Name);
    axios.get(`/api/character`, { headers: headers })
      .then(response => {
        console.log('Fetched character data:', response.data);
        const {
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
          cp,
          sp,
          ep,
          gp,
          pp,
          Proficiencies,
          Subclass,
          ...rest
        } = response.data;

        const abilityScores = {
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
        };

        const Wealth = {
          cp,
          sp,
          ep,
          gp,
          pp,
        };

        setCharacter(prevState => ({
          ...prevState,
          ...rest,
          id: response.data.id,  // Track character ID for saves
          abilityScores,
          Wealth,
          Proficiencies,
          Subclass,
        }));

        setLoading(false);
      })
      .catch(error => {
        console.error(error);
      });
  }, [])

  // // Log the character data whenever it changes
  // useEffect(() => {
  //   console.log("Character Sheet:", character);
  // }, [character]);


  function handleEdit(event, tileId) {
    event.stopPropagation();
    // console.log('Editing tile:', tileId);
    // Ensure we have fresh lists for class/race when editing their tiles
    if (tileId === 'Class') fetchPlayerClasses();
    if (tileId === 'Race') fetchPlayerRaces();
    setEditingTileId(tileId);
    setIsModalShown(true);
  }

  // When opening the Wealth modal, ensure add/spend inputs are reset
  useEffect(() => {
    if (isModalShown && editingTileId === 'Wealth') {
      setAddAmount({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
      setSpendAmount({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    }
  }, [isModalShown, editingTileId]);

  // This function will be called whenever the layout changes
  const handleLayoutChange = (layout, layouts) => {
    console.log(layout);
    localStorage.setItem('tileLayout', JSON.stringify(layouts));
  };

  const saveCharacter = (overridePayload = null) => {
    // Sanitize UI-facing fields that map to different backend names
    const payload = overridePayload ? { ...overridePayload } : { ...character };
    if (payload.XP !== undefined) {
      payload.ExperiencePoints = parseInt(payload.XP, 10) || 0;
      delete payload.XP;
    }
    if (payload['Current HP'] !== undefined) {
      payload.CurrentHitPoints = parseInt(payload['Current HP'], 10) || 0;
      delete payload['Current HP'];
    }
    if (payload['Temporary HP'] !== undefined) {
      payload.TemporaryHitPoints = parseInt(payload['Temporary HP'], 10) || 0;
      delete payload['Temporary HP'];
    }

    // Ensure subclass is saved explicitly
    if (character.Subclass && !payload.Subclass) {
      payload.Subclass = character.Subclass;
    }

    // Include character ID so backend knows which character to update
    if (character.id) {
      payload.id = character.id;
    }

    console.log('Saving character payload (Wealth):', payload.Wealth);
    console.log('Saving character ID:', payload.id);
    axios.put(`/api/character`, payload, { headers: headers })
    .then(response => {
      console.log('Character saved successfully', response.status);
      console.log('Server returned character wealth:', { cp: response.data.cp, sp: response.data.sp, ep: response.data.ep, gp: response.data.gp, pp: response.data.pp });
      // Update local state with canonical server response to avoid stale/misnamed keys
      const {
        strength,
        dexterity,
        constitution,
        intelligence,
        wisdom,
        charisma,
        cp,
        sp,
        ep,
        gp,
        pp,
        Proficiencies,
        ...rest
      } = response.data;

      setCharacter(prev => {
        const cleaned = { ...prev };
        // Remove UI-only keys if present
        delete cleaned.XP;
        delete cleaned['Current HP'];
        delete cleaned['Temporary HP'];

        return {
          ...cleaned,
          ...rest,
          id: response.data.id,  // Preserve character ID
          abilityScores: { strength, dexterity, constitution, intelligence, wisdom, charisma },
          Wealth: { cp, sp, ep, gp, pp },
          Proficiencies
        };
      });
    })
    .catch(error => {
      // error case
      console.error(error);
    });
  };

  function getModifier(score) {
    if (!score) return 0;
    return Math.floor((score - 10) / 2);
  }

  function calculateLevelAndMilestone(xp) {
    // XP thresholds for each level- eventually these can be retrieved from Postgres for whatever System is in use
    const levels = [
      { level: 1, xp: 0 },
      { level: 2, xp: 300 },
      { level: 3, xp: 900 },
      { level: 4, xp: 2700 },
      { level: 5, xp: 6500 },
      { level: 6, xp: 14000 },
      { level: 7, xp: 23000 },
      { level: 8, xp: 34000 },
      { level: 9, xp: 48000 },
      { level: 10, xp: 64000 },
      { level: 11, xp: 85000 },
      { level: 12, xp: 100000 },
      { level: 13, xp: 120000 },
      { level: 14, xp: 140000 },
      { level: 15, xp: 165000 },
      { level: 16, xp: 195000 },
      { level: 17, xp: 225000 },
      { level: 18, xp: 265000 },
      { level: 19, xp: 305000 },
      { level: 20, xp: 355000 },
    ];

    let currentLevel = 1;
    let nextMilestone = 300;

    for (let i = 0; i < levels.length; i++) {
      if (xp >= levels[i].xp) {
        currentLevel = levels[i].level;
        nextMilestone = levels[i + 1] ? levels[i + 1].xp : 'Max Level';
      } else {
        break;
      }
    }

    return { currentLevel, nextMilestone };
  }

  function calculateProficiencyBonus(level) {
    return Math.ceil(level / 4) + 1;
  }

  // Return a sensible default base walking speed (in feet) for a given race.
  // TODO: Prefer retrieving this from the race API when available.
  function getBaseSpeed(race) {
    if (!race) return 30; // default
    const r = String(race).toLowerCase();

    // Races with 25 ft base speed
    if (r.includes('dwarf') || r.includes('gnome') || r.includes('halfl') || r.includes('halfing')) {
      return 25;
    }

    // Special cases (common base speeds)
    if (r.includes('centaur')) return 40;
    if (r.includes('aarakocra') || r.includes('arakocra')) return 25;

    // Default base speed for most races
    return 30;
  }

  function calculateSkillPoints(skill, abilityScores, proficiencyBonus, isProficient) {
    const ability = skillAbilities[skill];

    // Check that ability score exists
    if (!abilityScores[ability]) {
      return 0; // return 0 if no ability score
    }

    const abilityScore = abilityScores[ability];
    const abilityModifier = Math.floor((abilityScore - 10) / 2);
    return abilityModifier + (isProficient ? proficiencyBonus : 0);
  }

  function calculateSavingThrows(abilityScores, proficiencyBonus, proficiencies) {
    const savingThrows = {};
    for (const ability in abilityScores) {
      const abilityScore = abilityScores[ability];
      const abilityModifier = Math.floor((abilityScore - 10) / 2);
      // Compare proficiencies case-insensitively (proficiencies may be stored in various casings)
      const normalizedProfs = (proficiencies || []).map(p => String(p).toLowerCase());
      const isProficient = normalizedProfs.includes(String(ability).toLowerCase());
      savingThrows[ability.toLowerCase()] = abilityModifier + (isProficient ? proficiencyBonus : 0);
    }
    return savingThrows;
  }

  const handleEquipmentChange = (e) => {
    const selectedIndex = e.target.selectedIndex - 1; // -1 to exclude the disabled "Select item" option
    const selectedItem = character.Equipment[selectedIndex];
    setSelectedEquipment(selectedItem);
  };

    // Function to normalize feature names
  function normalizeFeatureName(featureName) {
    return featureName.toLowerCase().replace(/\s+/g, '_');
  }
  
  // Updated formatFeatures function
  function formatFeatures(features, classData) {
    console.log('formatFeatures- Features (from character sheet):', features);
    // console.log('formatFeatures- Class Data:', classData);
    const classFeatures = (classData && classData.class_features) ? classData.class_features : {};
    console.log('formatFeatures- Class Features:', classFeatures);

    return features.map(feature => {
      const normalizedFeature = normalizeFeatureName(feature);
      const trait = classFeatures[normalizedFeature];
      console.log("formatFeatures- trait:", trait);

      let description = '';
      if (trait) {
        if (typeof trait === 'string') {
          description = trait;
        } else if (trait.description) {
          description = trait.description;
        } else if (trait.entries) {
          description = entriesToDescription(trait);
        }
      }

      return {
        name: feature,
        description,
      };
    });
  }

  // Flatten 5etools-style entries into a simple description string (best-effort)
  function entriesToDescription(entry) {
    if (!entry) return '';
    const parts = [];

    const walk = (node) => {
      if (!node) return;
      if (typeof node === 'string') {
        parts.push(node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object') {
        if (node.name && node.entries) {
          // include a heading-ish prefix
          parts.push(node.name);
          walk(node.entries);
          return;
        }
        if (node.entries) {
          walk(node.entries);
          return;
        }
        // fallback: stringify known fields
        if (node.text) parts.push(node.text);
      }
    };

    walk(entry.entries || entry);
    return parts.join('\n');
  }

  function normalizeFeat(feat) {
    if (!feat) return null;
    if (typeof feat === 'string') return { name: feat, description: '' };
    if (typeof feat === 'object') {
      const name = feat.name || feat.title || feat.id;
      if (!name) return null;
      return {
        name,
        description: feat.description || feat.desc || ''
      };
    }
    return null;
  }

  function mergeFeats(...lists) {
    const merged = [];
    const seen = new Set();
    lists.flat().forEach(item => {
      const nf = normalizeFeat(item);
      if (!nf) return;
      const key = String(nf.name).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(nf);
    });
    return merged;
  }

  function buildClassFeats(classData, level, className, subclassName) {
    if (!classData) return [];

    const norm = (s) => (s ? String(s).toLowerCase() : '');
    const matchesSubclass = (entry) => {
      if (!subclassName) return false;
      const n = entry.name || entry.subclassShortName || entry.shortName;
      return norm(n) === norm(subclassName);
    };

    // 1) From levels array features
    const featsFromLevels = (() => {
      const collected = [];
      const levels = classData.levels || [];
      for (let i = 0; i < level; i++) {
        if (levels[i] && Array.isArray(levels[i].features)) {
          collected.push(...levels[i].features);
        }
      }
      return formatFeatures(collected, classData);
    })();

    // 2) From classFeatures property (5etools style, often nested arrays)
    const featsFromClassFeatures = (() => {
      const out = [];
      if (Array.isArray(classData.classFeatures)) {
        classData.classFeatures.flat().forEach((cf, idx) => {
          if (!cf) return;
          if (typeof cf === 'string') {
            out.push({ name: cf, description: '' });
            return;
          }
          const name = cf.name || cf.title || cf.classFeature || `Feature ${idx + 1}`;
          const description = entriesToDescription(cf);
          if (cf.level && cf.level > level) return;
          out.push({ name, description });
        });
      }
      return out;
    })();

    // 3) From classFeature (capital F) array with level gating
    const featsFromClassFeature = (() => {
      const out = [];
      if (Array.isArray(classData.classFeature)) {
        classData.classFeature.forEach((cf, idx) => {
          if (!cf) return;
          if (cf.level && cf.level > level) return;
          const name = cf.name || cf.title || `Feature ${idx + 1}`;
          const description = entriesToDescription(cf);
          out.push({ name, description });
        });
      }
      return out;
    })();

    // 4) From entries (some newer data uses entries arrays like races)
    const featsFromEntries = (() => {
      if (!Array.isArray(classData.entries)) return [];
      return classData.entries
        .map((ent, idx) => {
          if (typeof ent === 'string') return { name: `Feature ${idx + 1}`, description: ent };
          const name = ent.name || ent.title || `Feature ${idx + 1}`;
          const description = entriesToDescription(ent);
          return { name, description };
        })
        .filter(Boolean);
    })();

    // 5) From a plain features array if present
    const featsFromFeaturesArray = Array.isArray(classData.features)
      ? classData.features.map((f, idx) => ({ name: f.name || f.title || f.id || `Feature ${idx + 1}`, description: f.description || entriesToDescription(f) }))
      : [];

    // 6) Subclass features filtered by selected subclass and level
    const featsFromSubclass = (() => {
      if (!subclassName || !Array.isArray(classData.subclassFeature)) return [];
      return classData.subclassFeature
        .filter(sf => (!sf.level || sf.level <= level) && (!sf.className || norm(sf.className) === norm(className)) && matchesSubclass(sf))
        .map((sf, idx) => ({
          name: sf.name || sf.title || `Subclass Feature ${idx + 1}`,
          description: entriesToDescription(sf)
        }));
    })();

    return mergeFeats(
      featsFromLevels,
      featsFromClassFeatures,
      featsFromClassFeature,
      featsFromEntries,
      featsFromFeaturesArray,
      featsFromSubclass
    );
  }

  // Fetch character and race information from Flask and update character state
  useEffect(() => {
    // Detect if Class, Subclass, or Race has changed
    const classChanged = prevClassRef.current !== null && prevClassRef.current !== character.Class;
    const subclassChanged = prevSubclassRef.current !== null && prevSubclassRef.current !== character.Subclass;
    const raceChanged = prevRaceRef.current !== null && prevRaceRef.current !== character.Race;

    const systemHeader = headers?.System || 'D&D 5e';
    const requestHeaders = { ...headers, System: systemHeader };
    const requestParams = { system: systemHeader };

    const fetchClassData = character.Class
      ? axios.get(`/api/classes/${encodeURIComponent(character.Class)}`, { headers: requestHeaders, params: requestParams })
      : Promise.resolve(null);
    const fetchRaceData = character.Race
      ? axios.get(`/api/races/${encodeURIComponent(character.Race)}`, { headers: requestHeaders, params: requestParams })
      : Promise.resolve(null);

    Promise.allSettled([fetchClassData, fetchRaceData])
      .then(([classResult, raceResult]) => {
        setCharacter(prevState => {
          let newCharacterState = { ...prevState };

          // Rebuild feats from scratch whenever we refetch class/race data
          let classFeats = [];
          let raceFeats = [];

          // Reset subclass dropdown while loading a new class
          if (classChanged) {
            setSubclassOptions([]);
          }

          // Reset feats and proficiencies if class, subclass, or race changed
          if (classChanged || subclassChanged || raceChanged) {
            console.log('Class/Subclass/Race changed - resetting feats and proficiencies');
            newCharacterState.Feats = [];
            newCharacterState.Proficiencies = [];
          }
  
          if (classResult.status === 'fulfilled' && classResult.value) {
            const classData = classResult.value.data || {};
            console.log('Class info from Flask-', classData);

          if (raceResult.status === 'fulfilled' && raceResult.value) {
            const raceData = raceResult.value.data;
              const names = classData.subclass
                .map(sc => sc && (sc.name || sc.shortName))
                .filter(Boolean);
              const uniq = [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
              setSubclassOptions(uniq);
            } else {
              setSubclassOptions([]);
            }

            // Safely handle missing hitPoints in class data
            const classHitPoints = classData.hit_points || { base: 0, level_increment: 0 };
            console.log("Class Hit Points:", classHitPoints);
            newCharacterState.HitPointMax = classHitPoints.base + (prevState.Level * (classHitPoints.level_increment + getModifier(prevState.abilityScores.constitution)));
            // Keep local hitPoints state in sync so the edit modal displays the class defaults
            setHitPoints(classHitPoints);

            classFeats = buildClassFeats(classData, prevState.Level, prevState.Class, prevState.Subclass || newCharacterState.Subclass);
            newCharacterState.Proficiencies = [
              ...(prevState.Proficiencies || []),
              ...(classData.armor_proficiencies || []),
              ...(classData.weapon_proficiencies || [])
            ];
          }
          if (classResult.status === 'rejected') {
            console.error('Error fetching class info:', classResult.reason);
            if (classChanged) setSubclassOptions([]);
          }
          if (raceResult.status === 'rejected') {
            console.error('Error fetching race info:', raceResult.reason);
          }
  
          if (raceResult.status === 'fulfilled' && raceResult.value) {
            const raceData = raceResult.value.data;
            console.log("raceData:", raceData);
  
            // Safely append languages (may be undefined) and traits
            newCharacterState.Proficiencies = [
              ...(newCharacterState.Proficiencies || []),
              ...(raceData.languages || [])
            ];
            newCharacterState.Speed = raceData.speed || newCharacterState.Speed;
            const raceTraits = raceData?.traits
              ? Object.entries(raceData.traits).map(([name, val]) => ({
                name,
                description: typeof val === "string" ? val : (val?.description ?? "")
              }))
              : [];

            // Newer format: entries array with objects containing name/entries
            const raceEntries = Array.isArray(raceData.entries)
              ? raceData.entries
                  .map((ent, idx) => {
                    if (typeof ent === 'string') return { name: `Trait ${idx + 1}`, description: ent };
                    const name = ent.name || ent.title || `Trait ${idx + 1}`;
                    const description = entriesToDescription(ent);
                    return { name, description };
                  })
                  .filter(Boolean)
              : [];

            raceFeats = mergeFeats(raceTraits, raceEntries);
          }
          else if (raceChanged) {
            // Clear race-dependent feats if race data failed to load
            raceFeats = [];
          }

          // Finalize feats as a clean recomputation from class/race data only
          newCharacterState.Feats = mergeFeats(classFeats, raceFeats);
  
          return newCharacterState;
        });

        // Update refs after processing
        prevClassRef.current = character.Class;
        prevSubclassRef.current = character.Subclass;
        prevRaceRef.current = character.Race;
      })
      .catch(error => {
        console.error(error);
      });
  }, [character.Class, character.Race, character.Level, character.Subclass]);


  // Calculate Skill Levels
  useEffect(() => {
    const proficiencyBonus = calculateProficiencyBonus(character.Level);
    const profsLower = (character.Proficiencies || []).map(p => String(p).toLowerCase());
    const Skills = Object.fromEntries(
      Object.entries(character.Skills).map(([skill, _]) => {
        const isProficient = profsLower.includes(String(skill).toLowerCase());
        const skillPoints = calculateSkillPoints(skill, character.abilityScores, proficiencyBonus, isProficient);
        return [skill, skillPoints];
      })
    );
    console.log("Skills:", Skills);

    const passivePerception = 10 + Skills.Perception; // Passive score is just 10 + skill modifier

    setCharacter(prevState => ({
      ...prevState,
      proficiencyBonus,
      Skills,
      PassivePerception: passivePerception
    }));
  }, [character.Level, character.abilityScores, character.Proficiencies]);

  // Calcualte character level and how many XP to next level
  useEffect(() => {
    const { currentLevel, nextMilestone } = calculateLevelAndMilestone(character.ExperiencePoints);
    setCharacter(prevState => ({
      ...prevState,
      Level: currentLevel,
      pointsToNextLevel: nextMilestone
    }));
  }, [character.ExperiencePoints]);

  // Calcualte Saving Throw values
  useEffect(() => {
    const savingThrows = calculateSavingThrows(character.abilityScores, character.proficiencyBonus, character.Proficiencies);
    setCharacter(prevState => ({
      ...prevState,
      SavingThrows: savingThrows,
    }));
  }, [character.abilityScores, character.proficiencyBonus, character.Proficiencies]);

  // Calculate Armor Class
  const calculateArmorClass = () => {
    const hasArmor = character.Equipment.some(item => item.type === 'Armor');
    const dexMod = getModifier(character.abilityScores.dexterity);

    if (hasArmor) {
      console.log('Character has armor equipped');
      const armor = character.Equipment.find(item => item.type === 'Armor');
      let armorClass = armor.AC;
      if (armor.type === 'Light Armor') {
        armorClass += dexMod;
      } else if (armor.type === 'Medium Armor') {
        armorClass += Math.min(dexMod, 2);
      }

      // Add class-specific AC bonuses
      if (character.Class === 'Barbarian') {
        armorClass += getModifier(character.abilityScores.constitution);
      }
      else if (character.Class === 'Monk') {
        armorClass = Math.max(armorClass, 10 + dexMod + getModifier(character.abilityScores.wisdom));
      }

      // Check for shields
      const shield = character.Equipment.find(item => item.type === 'Shield');
      if (shield) {
        armorClass += shield.AC;
      }

      // Check for other items that affect AC
      // TODO- Add logic for other items that can affect AC
      return armorClass;
    }
    // If no armor is equipped, calculate unarmored AC
    else {
      console.log(`Character is unarmored, calculating AC for ${character.Class}`);
      if (character.Class === 'Monk') {
        return 10 + dexMod + getModifier(character.abilityScores.wisdom);
      }
      else if (character.Class === 'Barbarian') {
        return 10 + dexMod + getModifier(character.abilityScores.constitution);
      }
      else if (character.Class === 'Wizard') {
        return 13 + dexMod;
      }
      else {  // Default unarmored AC
        return 10 + dexMod;
      }
    }
  }

  // Calculate Armor Class if equipment or Dexterity changes
  // Populate Attacks based on equipped weapons
  useEffect(() => {
    const armorClass = calculateArmorClass();
    console.log('Armor Class:', armorClass);
  
    // Initialize actions array
    const actions = [];
  
    // Add equipped weapons to actions
    character.Equipment.filter(item => item.type === 'Weapon' && item.equipped).forEach(weapon => {
      actions.push({
        name: weapon.name,
        bonusToHit: determineBonusToHit(weapon),
        damage: determineDamage(weapon),
        damageType: weapon.damage_type,
        range: weapon.weapon_range
      });
    });
  
    // Add default unarmed strike
    actions.push({
      name: 'Unarmed Strike',
      bonusToHit: determineBonusToHit({ type: 'unarmed' }),
      damage: determineDamage({ weapon_type: 'unarmed', damage: '1' }),
      damageType: 'bludgeoning',
      range: 'melee'
    });
  
    setCharacter(prevState => ({
      ...prevState,
      ArmorClass: armorClass,
      Attacks: actions
    }));
  }, [character.Equipment, character.abilityScores]);
  
  // Calculate Attack Modifiers
  const determineBonusToHit = (weapon) => {
    let mod = 0;
    const weaponType = weapon['type'];
  
    if (["simple melee", "martial melee", "melee", "unarmed"].includes(weaponType)) {
      mod = getModifier(character.abilityScores.strength);
    } else if (["simple ranged", "martial ranged", "ranged"].includes(weaponType)) {
      mod = getModifier(character.abilityScores.dexterity);
    }
  
    if (character.Proficiencies.includes(weaponType) ||
        (weaponType.includes("melee") && character.Proficiencies.includes("melee")) ||
        (weaponType.includes("ranged") && character.Proficiencies.includes("ranged"))) {
      mod += character.proficiencyBonus;
    }
  
    return mod;
  };
  
  const determineDamage = (weapon) => {
    const baseDamage = weapon.damage;
    let mod = 0;
  
    if (["simple melee", "martial melee", "unarmed"].includes(weapon.weapon_type)) {
      mod = getModifier(character.abilityScores.strength);
    } else if (["simple ranged", "martial ranged"].includes(weapon.weapon_type)) {
      mod = getModifier(character.abilityScores.dexterity);
    }
  
    return `${baseDamage} + ${mod}`;
  };

  function consumeSelectedItem() {
    // Remove the selected item from the character's equipment list
    const newEquipment = character.Equipment.filter(item => item !== selectedEquipment);
    setCharacter(prevState => ({
      ...prevState,
      Equipment: newEquipment
    }));
    setSelectedEquipment(null);
    saveCharacter();
  }

  function generateTileContent(tileId) {
    switch (tileId) {
      case 'Name':
        return (
          <div>
            {character?.Name ? (
              <h1>{character.Name}</h1>
            ) : (
              <Placeholder as="h1" animation="glow" />
            )}
          </div>
        );
      case 'Class':
        return (
          <>
            <div className="label">Class:</div>
            <h3 className="center">
              {character?.Class && character?.Level ? (
                <>
                  <div style={{ textAlign: 'center' }}>{`${character.Class} ${character.Level}`}</div>
                  {character?.Subclass ? (
                    <div style={{ fontSize: '0.9em', textAlign: 'center' }}>{character.Subclass}</div>
                  ) : null}
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <Placeholder as="span" animation="glow">
                      <Placeholder xs={6} />
                    </Placeholder>
                  </div>
                  <div style={{ fontSize: '0.9em', textAlign: 'center' }}>
                    <Placeholder as="span" animation="glow">
                      <Placeholder xs={4} />
                    </Placeholder>
                  </div>
                </>
              )}
            </h3>
          </>
        );
      case 'Background':
        return (
          <>
            <div className="label">Background:</div>
            <h4 className="center">
              {character?.Background ? (
                character.Background
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              )}
            </h4>
          </>
        );
      case 'XP':
        return (
          <>
            <h3 className="center-title">XP</h3>
            <div className="center-title">
              {character?.ExperiencePoints && character?.pointsToNextLevel ? (
                `${character.ExperiencePoints} / ${character.pointsToNextLevel}`
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Race':
        return (
          <>
            <div className="label">Race:</div>
            <h4 className="center">
              {character?.Race ? (
                character.Race
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              )}
            </h4>
          </>
        );
      case 'Alignment':
        return (
          <>
            <div className="label">Alignment:</div>
            <h4 className="center">
              {character?.Alignment ? (
                character.Alignment
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              )}
            </h4>
          </>
        );
      case 'Ability Scores':
        return (
          <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
            {character?.abilityScores ? (
              Object.entries(character.abilityScores).map(([ability, value]) => {
                const sentenceCaseAbility = ability.charAt(0).toUpperCase() + ability.slice(1).toLowerCase();
                return (
                  <div key={ability} className="ability-score-container">
                    <p className="center-title">{`${sentenceCaseAbility}:`} </p>
                    <h3 className="center">{`${value}`}</h3>
                  </div>
                );
              })
            ) : (
              <div>
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              </div>
            )}
          </div>
        );
      case 'Proficiency Bonus':
        return (
          <>
            <div className="label">Proficiency Bonus:</div>
            <h4 className="center-title">
              {character?.proficiencyBonus ? (
                character.proficiencyBonus
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              )}
            </h4>
          </>
        );
      case 'Saving Throws':
        return (
          <>
            {character?.SavingThrows ? (
              <>
                <h3>Saving Throws:</h3>
                <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
                  {Object.entries(character.SavingThrows).map(([ability, value]) => {
                    const sentenceCaseAbility = ability.charAt(0).toUpperCase() + ability.slice(1).toLowerCase();
                    return (
                      <div className='skill-row' key={ability}>
                        <span className="label">{`${sentenceCaseAbility}: `}</span>
                        <span className="label-right">{`${value}`}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div>
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={6} />
                </Placeholder>
              </div>
            )}
          </>
        );
      case 'Initiative':
        return (
          <>
            <div className="label">Initiative:</div>
            <h2 className="center">
              {character?.Initiative ? (
                <>
                  {character.Initiative}
                </>
              ) : (
                <>
                    <Placeholder as="span" animation="glow">
                      <Placeholder xs={6} />
                    </Placeholder>
                </>
              )}
            </h2 >
          </>
        );
      case 'Speed':
        return (
          <>
            <div className="label">Speed:</div>
            <h2 className="center">
              {character?.Speed ? (
                character.Speed
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={4} />
                </Placeholder>
              )}
            </h2>
          </>
        );
      case 'Armor Class':
        return (
          <div>
            <span className="label">Armor Class:</span>
            <h3 className="center">
              {character?.ArmorClass ? (
                character.ArmorClass
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={4} />
                </Placeholder>
              )}
            </h3>
          </div>
        );
      case 'Max HP':
        return (
          <>
            <div className="label">Max HP</div>
            <h3 className="center">
              {character?.HitPointMax ? (
                character.HitPointMax
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={4} />
                </Placeholder>
              )}
            </h3>
          </>
        );
      case 'Current HP':
        return (
          <>
            <span className="label">Current HP</span>
            <div className="center">
              <h3>
                {character?.CurrentHitPoints ? (
                  character.CurrentHitPoints
                ) : (
                  <Placeholder as="span" animation="glow">
                    <Placeholder xs={4} />
                  </Placeholder>
                )}
              </h3>
            </div>
          </>
        );
      case 'Temporary HP':
        return (
          <>
            <div className="label">Temporary HP</div>
            <h3 className="center">
              {character?.TemporaryHitPoints ? (
                character.TemporaryHitPoints
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={4} />
                </Placeholder>
              )}
            </h3>
          </>
        );
      case 'Skills':
        return (
          <>
            <h3>Skills:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.Skills ? (
                Object.entries(character.Skills).map(([skill, score]) => {
                  const sentenceCaseSkillAbility = skillAbilities[skill].charAt(0).toUpperCase() + skillAbilities[skill].slice(1).toLowerCase();
                  return (
                    <div className="skill-row" key={skill}>
                      <span>{skill}: {score}</span>
                      <span className="label-right">({sentenceCaseSkillAbility})</span>
                    </div>
                  );
                })
              ) : (
                <Placeholder as="div" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Feats':
        return (
          <>
            <h3>Feats:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {Array.isArray(character?.Feats) && character.Feats.length > 0 ? (
                character.Feats
                  .map(normalizeFeat)
                  .filter(Boolean)
                  .map((feat, index) => (
                    <div key={`${feat.name}-${index}`}>
                      <h4>{feat.name}</h4>
                      {feat.description ? <p>{feat.description}</p> : null}
                    </div>
                  ))
              ) : (
                <Placeholder as="p" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Attacks':
        return (
          <>
            <h2>Attacks:</h2>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {Array.isArray(character?.Attacks) && character.Attacks.length > 0 ? (
                character.Attacks.map((attack, index) => (
                  <div key={`${attack.name || 'attack'}-${index}`}>
                    <h4>{attack.name || 'Unnamed Attack'}</h4>
                    <div>Bonus to Hit: {attack.bonusToHit ?? 0}</div>
                    <div>Damage: {attack.damage ?? '—'} ({attack.damageType || attack.damage_type || '—'})</div>
                    <div>Range: {attack.range || attack.weapon_range || '—'}</div>
                    {/* <div>Special Properties: </div> */}
                    <p />
                  </div>
                ))
              ) : (
                <Placeholder as="p" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Actions':
        return (
          <>
            <h3>Actions:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              <p>Attack - choose a weapon to use & roll a D20</p>
              <p>Grapple - Athletics check to restrain someone, with advantage. On the next turn, you can pin them.</p>
              <p>Shove - Athletics check to push someone within reach back by 1 square (5 feet), or knock them prone.</p>
              <p>Use Object - example: administering a potion to ally</p>
              <p>Dash - Use the action on your turn to move</p>
              <p>Disengage - run away without getting hit</p>
              <p>Dodge - enemies have disadvantage attacking you</p>
              <p>Help - gives an ally advantage on an ability check</p>
              <p>Hide - make a stealth check to be hidden</p>
              <p>Ready - wait for a specific condition, then attack</p>
              <p>Search - Perception or Investigation check</p>
            </div>
          </>
        );
      case 'Spells':
        return (
        <div>
          <h3>Spells:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character.Spells.map((spell, index) => (
                <p key={index}>{spell}</p>
              ))}
            </div>
        </div>);
      case 'Equipment':
        return (
          <>
            <h3>Equipment:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {Array.isArray(character?.Equipment) && character.Equipment.length > 0 ? (
                character.Equipment.map((item, index) => (
                  <div key={index}>{item.name}</div>
                ))
              ) : (
                <p>No items equipped. Check your inventory to equip more items!</p>
              )}
            </div>
          </>
        );
      case 'Proficiencies':
        return (
          <>
            <h3>Proficiencies:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.Proficiencies ? (
                character.Proficiencies.map((proficiency, index) => (
                  <div key={index}>{proficiency}</div>
                ))
              ) : (
                <Placeholder as="div" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Passive Perception':
        return (
          <>
            <div className="label">Passive Perception</div>
            <h3 className="center-title">
              {character?.PassivePerception ? (
                character.PassivePerception
              ) : (
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={4} />
                </Placeholder>
              )}
            </h3>
          </>
        );
      case 'Wealth':
        return (
          <>
            <h3>Wealth:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.Wealth ? (
                Object.entries(character.Wealth).map(([currency, amount]) => (
                  <div key={currency}>
                    <span>{amount}</span>
                    <span> {currency}</span>
                  </div>
                ))
            ) : (
              <Placeholder as="div" animation="glow">
                <Placeholder xs={12} />
              </Placeholder>
            )}
            </div>
          </>
        );
      case 'Personality Traits':
        return (
          <>
            <h4 className='center-title'>Personality Traits:</h4>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.PersonalityTraits ? (
                <p>{character.PersonalityTraits}</p>
              ) : (
                <Placeholder as="p" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Ideals':
        return (
          <>
            <h4 className="center-title">Ideals</h4>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.Ideals ? (
                <p>{character.Ideals}</p>
              ) : (
                <Placeholder as="p" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Bonds':
        return (
          <>
            <h4 className="center-title">Bonds</h4>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.Bonds ? (
                <p>{character.Bonds}</p>
              ) : (
                <Placeholder as="p" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      case 'Flaws':
        return (
          <>
            <h4 className="center-title">Flaws</h4>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character?.Flaws ? (
                <p>{character.Flaws}</p>
              ) : (
                <Placeholder as="p" animation="glow">
                  <Placeholder xs={12} />
                </Placeholder>
              )}
            </div>
          </>
        );
      default:
        return null;
    }
  }


  return (
    <>
      <div style={{ height: '100vh', overflow: 'auto' }}>
        <ResponsiveGridLayout
          className="layout"
          cols={{ lg: 7, md: 7, sm: 7, xs: 4, xxs: 2 }}
          rowHeight={20}
          layouts={getLayouts()}
          onLayoutChange={handleLayoutChange}
        >
          {character && tiles.map(tile => (
            <div key={tile.i} className="tile" > {/* Apparently this being className "tile is important for the edit button to work */}
              <div
                className="edit-icon"
                onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); }}
                onClick={(event) => { event.stopPropagation(); handleEdit(event, tile.i); }}
              >
                <EditIcon />
              </div>
              <Paper elevation={3} style={{ height: '100%', padding: '10px', position: 'relative', position: 'relative'}}>
                {loading ? (
                  <Placeholder as="div" animation="glow">
                    <Placeholder xs={12} />
                    <Placeholder xs={12} />
                    <Placeholder xs={12} />
                    <Placeholder xs={12} />
                  </Placeholder>
                ) : (
                  generateTileContent(tile.i)
                )}
              </Paper>
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>

      {/* Modal for editing Tiles */}
      <Modal show={isModalShown} onHide={() => setIsModalShown(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Editing tile: {editingTileId}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={e => e.preventDefault()}>
            {(() => {
              // Determine what type of input to display based on the tileId
              switch (editingTileId) {
                case 'Name': {
                  return (
                    <Form.Group>
                      <Form.Label>Select character</Form.Label>
                      <Form.Control
                        as="select"
                        value={character.Name || ''}
                        onChange={e => switchCharacter(e.target.value)}
                      >
                        <option value="" disabled>Select character</option>
                        {(() => {
                          const options = [...characters];
                          if (character.Name && !options.includes(character.Name)) options.unshift(character.Name);
                          if (options.length === 0) return <option disabled>No characters found</option>;
                          return options.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ));
                        })()}
                      </Form.Control>
                    </Form.Group>
                  );
                }
                case 'Background':
                case 'Personality Traits':
                case 'Bonds':
                case 'Ideals':
                case 'Flaws':
                  return (
                    <Form.Group>
                      <Form.Label>{editingTileId}</Form.Label>
                      <Form.Control as="textarea"
                        placeholder={editingTileId}
                        value={character[editingTileId]}
                        onChange={e => {
                          setCharacter({
                            ...character,
                            [editingTileId]: e.target.value,
                          });
                        }}
                      />
                    </Form.Group>
                  );
                case 'XP':
                case 'Current HP':
                case 'Temporary HP': {
                  // Map UI-facing tile ids to canonical character keys
                  const map = {
                    'XP': 'ExperiencePoints',
                    'Current HP': 'CurrentHitPoints',
                    'Temporary HP': 'TemporaryHitPoints'
                  };
                  const fieldKey = map[editingTileId];

                  return (
                    <Row>
                      <label>{editingTileId}</label>
                      <input
                        type="number"
                        value={character[fieldKey] ?? ''}
                        onChange={e => {
                          // Store as number when possible
                          const val = e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0;
                          setCharacter({
                            ...character,
                            [fieldKey]: val,
                          });
                        }} />
                    </Row>
                  );
                }
                case 'Class':
                  return (
                    <>
                      <Form.Label>Class</Form.Label>
                      <Form.Control as="select" value={character.Class} onChange={e => {
                        setCharacter({
                          ...character,
                          [editingTileId]: e.target.value,
                          Subclass: null,
                        });
                      }}>
                        <option value="" disabled>Select class</option>
                        {(() => {
                          const options = [...playerClasses];
                          if (character.Class && !options.includes(character.Class)) options.unshift(character.Class);
                          if (options.length === 0) return <option disabled>No classes defined</option>;
                          return options.map(playerClass => (
                            <option key={playerClass} value={playerClass}>{playerClass}</option>
                          ));
                        })()}
                      </Form.Control>

                      <Form.Label style={{ marginTop: '0.75rem' }}>Subclass</Form.Label>
                      <Form.Control as="select" value={character.Subclass || ''} onChange={e => {
                        setCharacter({
                          ...character,
                          Subclass: e.target.value || null,
                        });
                      }}>
                        <option value="">(None)</option>
                        {(() => {
                          const options = [...subclassOptions];
                          if (character.Subclass && !options.includes(character.Subclass)) options.unshift(character.Subclass);
                          return options.map(sc => (
                            <option key={sc} value={sc}>{sc}</option>
                          ));
                        })()}
                      </Form.Control>
                    </>
                  );
                case 'Race':
                  return(
                    <Form.Control as="select" value={character.Race} onChange={e => {
                      setCharacter({
                        ...character,
                        [editingTileId]: e.target.value,
                      });
                    }}>
                      <option value="" disabled>Select race</option>
                      {(() => {
                        const options = [...playerRaces];
                        if (character.Race && !options.includes(character.Race)) options.unshift(character.Race);
                        if (options.length === 0) return <option disabled>No races defined</option>;
                        return options.map(race => (
                          <option key={race} value={race}>{race}</option>
                        ));
                      })()}
                    </Form.Control>
                  );
                case 'Alignment':
                  return(
                    <Form.Control as="select" value={character.Alignment} onChange={e => {
                      setCharacter({
                        ...character,
                        [editingTileId]: e.target.value,
                      });
                    }}>
                      <option value="" disabled>Select alignment</option>
                      {alignments.map(alignment => (
                        <option key={alignment} value={alignment}>{alignment}</option>
                      ))}
                    </Form.Control>
                  );
                case 'Ability Scores':
                  return Object.entries(character.abilityScores).map(([score, value]) => (
                    <Row key={score}>
                      <Col>
                        <label>{score}</label>
                      </Col>
                      <Col>
                        <input
                        type="number"
                        value={value}
                        onChange={e => {
                          setCharacter({
                            ...character,
                            abilityScores: {
                              ...character.abilityScores,
                              [score]: e.target.value,
                            },
                          });
                        }}/>
                      </Col>
                    </Row>
                  ));
                case 'Skills':
                  return Object.entries(character.Skills).map(([skill, value]) => {
                    const isChecked = (character.Proficiencies || []).map(p => String(p).toLowerCase()).includes(String(skill).toLowerCase());
                    return (
                      <Form.Check
                        type="checkbox"
                        key={skill}
                        label={`Proficient in ${skill}`}
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setCharacter({
                              ...character,
                              Proficiencies: [...(character.Proficiencies || []), skill],
                            });
                          } else {
                            setCharacter({
                              ...character,
                              Proficiencies: (character.Proficiencies || []).filter(proficiency => String(proficiency).toLowerCase() !== String(skill).toLowerCase()),
                            });
                          }
                        }}
                      />
                    );
                  });
                case 'Saving Throws':
                  return Object.entries(character.SavingThrows).map(([Throw, value]) => {
                    const isChecked = (character.Proficiencies || []).map(p => String(p).toLowerCase()).includes(String(Throw).toLowerCase());
                    return (
                      <Form.Check
                        type="checkbox"
                        key={Throw}
                        label={`Proficient in ${Throw}`}
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setCharacter({
                              ...character,
                              Proficiencies: [...(character.Proficiencies || []), Throw],
                            });
                          } else {
                            setCharacter({
                              ...character,
                              Proficiencies: (character.Proficiencies || []).filter(proficiency => String(proficiency).toLowerCase() !== String(Throw).toLowerCase()),
                            });
                          }
                        }}
                      />
                    );
                  });
                case 'Wealth':
                  return (
                    <div>
                      <Table striped bordered hover style={{ maxWidth: "100%" , margin: 0, padding: 0 }}>
                        <colgroup>
                          <col style={{ width: '20%' }}/>
                          <col style={{ width: '30%' }}/>
                          <col style={{ width: '25%' }}/>
                          <col style={{ width: '25%' }}/>
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Currency</th>
                            <th>Amount</th>
                            <th>Add</th>
                            <th>Spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(character.Wealth).map(([currency, amount], index) => (
                            <tr key={currency}>
                              <td>{currency}</td>
                              <td>
                                <input
                                  style={{ width: '80%' }}
                                  type="number"
                                  value={amount}
                                  onChange={e => {
                                    const newAmount = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                                    setCharacter(prevCharacter => {
                                      const newWealth = { ...prevCharacter.Wealth };
                                      newWealth[currency] = newAmount;
                                      return { ...prevCharacter, Wealth: newWealth };
                                    });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  style={{ width: '80%' }}
                                  value={addAmount[currency] || 0}
                                  onChange={e => handleAddAmount(currency, e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  style={{ width: '80%' }}
                                  type="number"
                                  value={spendAmount[currency] || 0}
                                  onChange={e => handleSpendAmount(currency, e.target.value)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                      {/* Show a hint when requested spend exceeds a single-currency balance and we'll make change */}
                      {(() => {
                        const conversionRates = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
                        // compute totals after adding addAmount
                        let totalSpend = 0;
                        let totalWealth = 0;
                        const insufficient = [];
                        for (const c of Object.keys(spendAmount)) {
                          const s = parseInt(spendAmount[c], 10) || 0;
                          totalSpend += s * conversionRates[c];
                          const available = (parseInt(character.Wealth[c], 10) || 0) + (parseInt(addAmount[c], 10) || 0);
                          if (s > available) insufficient.push(c);
                        }
                        for (const c of Object.keys(conversionRates)) {
                          totalWealth += ((parseInt(character.Wealth[c], 10) || 0) + (parseInt(addAmount[c], 10) || 0)) * conversionRates[c];
                        }

                        if (insufficient.length > 0 && totalWealth >= totalSpend) {
                          return (
                            <div style={{ marginTop: 8, marginBottom: 8, color: '#555' }}>
                              Auto-making change from larger denominations for: {insufficient.join(', ')}
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <button onClick={handleWealthUpdate}>Update Wealth</button>
                    </div>
                  );
                case 'Equipment':
                  return (
                    <>
                      <Form.Control as="select" defaultValue="" onChange={handleEquipmentChange}>
                        <option value="" disabled>Select item</option>
                        {character.Equipment.map((item, index) => (
                          <option key={index} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </Form.Control>
                      {selectedEquipment && (
                        <div>
                          <h4>{selectedEquipment.name}</h4>
                          <p>Quantity: {selectedEquipment.quantity}</p>
                          <p>Type: {selectedEquipment.type}</p>
                          {selectedEquipment.type === 'Weapon' && (
                            <>
                              <p>Damage: {selectedEquipment.damage} {selectedEquipment.damageType}</p>
                              <p>Range: {selectedEquipment.weapon_range}</p>
                            </>
                          )}
                          {selectedEquipment.type === 'Armor' && (
                            <>
                              <p>AC: {selectedEquipment.AC}</p>
                              <p>Armor Type: {selectedEquipment.armorType}</p>
                            </>
                          )}
                          <p>Description: {selectedEquipment.description}</p>
                          <p>Weight: {selectedEquipment.weight} pound{selectedEquipment.weight > 1 ? 's' : ''}</p>

                        </div>
                      )}
                    </>
                  );
                case 'Armor Class':
                {
                  const equipment = character.Equipment;
                  console.log("Dexterity:", character.abilityScores.dexterity);
                  const dexMod = getModifier(character.abilityScores.dexterity);
                  console.log("DexMod:", dexMod);
                  const armorClass = calculateArmorClass(character.Equipment);
                  let explanation = "";
                
                  const hasArmor = character.Equipment.some(item => item.type === 'Armor');
                  if (hasArmor) {
                    const armor = character.Equipment.find(item => item.type === 'Armor');
                    explanation = `You have ${armor.name} equipped, which grants an Armor Class of ${armor.AC}.`;
                    if (armor.type === 'Light Armor') {
                      explanation += ` As it's Light Armor, your Dexterity modifier of ${dexMod} is added, giving you a total Armor Class of ${armorClass}.`;
                    } else if (armor.type === 'Medium Armor') {
                      const appliedDexMod = Math.min(dexMod, 2);
                      explanation += ` As it's Medium Armor, a Dexterity modifier of up to +2 is added. Your Dexterity modifier is ${dexMod}, so an additional ${appliedDexMod} is added, giving you a total Armor Class of ${armorClass}.`;
                    } else {
                      explanation += ` Heavy Armor doesn't have any additional modifiers, so your total Armor Class remains ${armorClass}.`;
                    }
                  } else {
                    // Add class-specific AC bonuses
                    if (character.Class === 'Barbarian') {
                      const conMod = getModifier(character.abilityScores.constitution);
                      explanation += ` As a Barbarian, your Constitution modifier of ${conMod} is added, giving you a total Armor Class of ${armorClass}.`;
                    } else if (character.Class === 'Monk') {
                      const wisMod = getModifier(character.abilityScores.wisdom);
                      explanation += ` As a Monk, your Armor Class is the higher of 10 + Dexterity modifier (${dexMod}) + Wisdom modifier (${wisMod}) or your current Armor Class, giving you a total Armor Class of ${armorClass}.`;
                    } else if (character.Class === 'Wizard') {
                      explanation += ` As a Wizard, your Armor Class is the lower of 13 + Dexterity modifier (${dexMod}) or your current Armor Class, giving you a total Armor Class of ${armorClass}.`;
                    } else {
                      explanation = `You don't have any armor equipped. Your base Armor Class is 10 and your Dexterity modifier of ${dexMod} is added, giving you a total Armor Class of ${armorClass}.`;
                    }
                  }
                
                  // Check for shields
                  const shield = character.Equipment.find(item => item.type === 'Shield');
                  if (shield) {
                    explanation += ` You have a shield equipped, which grants an additional Armor Class of ${shield.AC}, giving you a total Armor Class of ${armorClass}.`;
                  }
                
                  // TODO: Add logic for other items that can affect AC
                
                  return <p>{explanation}</p>;
                };
                case 'Attacks': {
                  const weapons = Array.isArray(character.Equipment) ? character.Equipment.filter(item => item.type === 'Weapon') : [];
                  const standardActions = [
                    'Attack - choose a weapon to use & roll a D20',
                    'Grapple - Athletics check to restrain someone, with advantage. On the next turn, you can pin them.',
                    'Shove - Athletics check to push someone within reach back by 1 square (5 feet), or knock them prone.',
                    'Use Object - example: administering a potion to an ally',
                    'Dash - Use the action on your turn to move',
                    'Disengage - run away without getting hit',
                    'Dodge - enemies have disadvantage attacking you',
                    'Help - gives an ally advantage on an ability check',
                    'Hide - make a stealth check to be hidden',
                    'Ready - wait for a specific condition, then attack',
                    'Search - Perception or Investigation check'
                  ];

                  return (
                    <div>
                      <h3>Standard Attacks</h3>
                      <ul>
                        {standardActions.map((action, idx) => (
                          <li key={idx}>{action}</li>
                        ))}
                      </ul>

                      {weapons.length > 0 ? (
                        <div>
                          <h4>Equipped Weapons</h4>
                          <ul>
                            {weapons.map((weapon, index) => (
                              <li key={index}>{weapon?.name || weapon?.item || 'Unnamed Weapon'}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p>No weapons equipped.</p>
                      )}
                    </div>
                  );
                }
                case 'Max HP':
                  return (
                    <>
                      <p>Total HP = base + (Character Level) * (Level Increment + Constitution Modifier)</p>
                      <p>HP Per Level: {hitPoints.level_increment} + {getModifier(character.abilityScores.constitution)} (derived from {character.abilityScores.constitution} Constitution Score.)</p>
                      <p>Total HP = {hitPoints.base} + {character.Level} * (HP increase per level)</p>
                      <p>Total HP = {character.HitPointMax}</p>
                    </>
                  );
                case 'Proficiency Bonus':
                  return (
                    <p>Your proficiency bonus is determined by your character level. At level {character.Level}, your proficiency bonus is {character.proficiencyBonus}.</p>
                  );
                case 'Initiative':
                  return (
                    <p>Your initiative modifier is equal to your Dexterity modifier, which is {getModifier(character.abilityScores.dexterity)} based on your Dexterity score of {character.abilityScores.dexterity}.</p>
                  );
                case 'Speed':
                  return (
                    <p>Your base speed is determined by your race. As a {character.Race}, your base speed is {getBaseSpeed(character.Race)} feet.</p>
                  );
                case 'Spells':
                  return (
                    <p>Your spells are determined by your class and level. Refer to your class spell list for available spells and spell slots.</p>
                  );
                case 'Feats':
                  return (
                    <p>Feats provide special abilities or advantages to your character. You can choose feats when you reach certain levels, as specified in the rules.</p>
                  );
                case 'Actions':
                  return (
                    <p>Actions are the things your character can do on their turn in combat. This includes attacking, casting spells, and other special maneuvers.</p>
                  );
                default:
                  return (
                    <div>Nothing to Edit Here!</div>
                  );
              }
            })()}
          </form>
        </Modal.Body>
        <Modal.Footer>
          {editingTileId === 'Equipment' && (
            <Button variant="danger" onClick={() => {
              consumeSelectedItem();
              setIsModalShown(false);
            }}>
              Consume
            </Button>
          )}
          <Button variant="primary" onClick={() => {
            saveCharacter();
            setIsModalShown(false);
          }}>
            Save changes
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default CharacterSheet;
