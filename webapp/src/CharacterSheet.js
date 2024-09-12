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

// Default Layout for Character Sheet Tiles
// const tiles = [
//   { i: 'Name', x: 0, y: 0, w: 2, h: 4 },
//   { i: 'Class', x: 2, y: 0, w: 1, h: 3 },
//   { i: 'Race', x: 2, y: 3, w: 1, h: 3 },
//   { i: 'Alignment', x: 3, y: 0, w: 1, h: 4 },
//   { i: 'Ability Scores', x: 0, y: 3, w: 1, h: 20 },
//   { i: 'Proficiency Bonus', x: 1, y: 3, w: 1, h: 3 },
//   { i: 'Saving Throws', x: 1, y: 6, w: 1, h: 12 },
//   { i: 'Skills', x: 3, y: 14, w: 2, h: 19 },
//   { i: 'PersonalityTraits', x: 5, y: 30, w: 2, h: 4 },
//   { i: 'Ideals', x: 0, y: 31, w: 2, h: 4 },
//   { i: 'Bonds', x: 0, y: 35, w: 2, h: 4 },
//   { i: 'Flaws', x: 3, y: 33, w: 2, h: 5 },
//   { i: 'Feats', x: 5, y: 0, w: 2, h: 9 },
//   { i: 'Attacks', x: 5, y: 9, w: 2, h: 7 },
//   { i: 'Actions', x: 3, y: 28, w: 2, h: 5 },
//   { i: 'Spells', x: 5, y: 23, w: 2, h: 7 },
//   { i: 'Equipment', x: 5, y: 16, w: 2, h: 7 },
//   { i: 'Proficiencies', x: 1, y: 19, w: 2, h: 12 },
//   { i: 'Wealth', x: 2, y: 12, w: 1, h: 7 },
//   { i: 'Initiative', x: 3, y: 6, w: 1, h: 3 },
//   { i: 'Speed', x: 4, y: 3, w: 1, h: 3 },
//   { i: 'Armor Class', x: 2, y: 6, w: 1, h: 3 },
//   { i: 'Background', x: 3, y: 4, w: 1, h: 3 },
//   { i: 'ExperiencePoints', x: 4, y: 0, w: 1, h: 4 },
//   { i: 'PassivePerception', x: 3, y: 12, w: 2, h: 2 },
//   { i: 'HitPointMax', x: 2, y: 9, w: 1, h: 3 },
//   { i: 'CurrentHitPoints', x: 3, y: 9, w: 1, h: 3 },
//   { i: 'TemporaryHitPoints', x: 4, y: 9, w: 1, h: 3 }
// ];

const tiles = [
  { "w": 2, "h": 4, "x": 0, "y": 0, "i": "Name"},
  { "w": 1, "h": 3, "x": 2, "y": 0, "i": "Class"},
  { "w": 1, "h": 3, "x": 2, "y": 3, "i": "Race"},
  { "w": 1, "h": 4, "x": 3, "y": 0, "i": "Alignment"},
  { "w": 1, "h": 20, "x": 0, "y": 4, "i": "Ability Scores"},
  { "w": 1, "h": 3, "x": 1, "y": 4, "i": "Proficiency Bonus"},
  { "w": 1, "h": 12, "x": 1, "y": 7, "i": "Saving Throws"},
  { "w": 2, "h": 19, "x": 3, "y": 15, "i": "Skills"},
  { "w": 2, "h": 4, "x": 5, "y": 23, "i": "PersonalityTraits"},
  { "w": 2, "h": 4, "x": 0, "y": 31, "i": "Ideals"},
  { "w": 2, "h": 4, "x": 0, "y": 35, "i": "Bonds"},
  { "w": 2, "h": 5, "x": 3, "y": 34, "i": "Flaws"},
  { "w": 2, "h": 9, "x": 5, "y": 0, "i": "Feats"},
  { "w": 1, "h": 1, "x": 0, "y": 39, "i": "Attacks"},
  { "w": 1, "h": 1, "x": 0, "y": 40, "i": "Actions"},
  { "w": 2, "h": 7, "x": 5, "y": 16, "i": "Spells"},
  { "w": 2, "h": 7, "x": 5, "y": 9, "i": "Equipment"},
  { "w": 2, "h": 12, "x": 1, "y": 19, "i": "Proficiencies"},
  { "w": 1, "h": 7, "x": 2, "y": 12, "i": "Wealth"},
  { "w": 1, "h": 3, "x": 3, "y": 7, "i": "Initiative"},
  { "w": 1, "h": 3, "x": 4, "y": 4, "i": "Speed"},
  { "w": 1, "h": 3, "x": 2, "y": 6, "i": "Armor Class"},
  { "w": 1, "h": 3, "x": 3, "y": 4, "i": "Background"},
  { "w": 1, "h": 4, "x": 4, "y": 0, "i": "ExperiencePoints"},
  { "w": 2, "h": 2, "x": 3, "y": 13, "i": "PassivePerception"},
  { "w": 1, "h": 3, "x": 2, "y": 9, "i": "HitPointMax"},
  { "w": 1, "h": 3, "x": 3, "y": 10, "i": "CurrentHitPoints"},
  { "w": 1, "h": 3, "x": 4, "y": 7, "i": "TemporaryHitPoints"}
]

const defaultLayout = {
  lg: tiles,
  md: tiles,
  sm: tiles,
  xs: tiles,
  xxs: tiles,
};

function CharacterSheet({ headers, characterName }) {
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

  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [weapons, setWeapons] = useState([]);
  const [preparedSpells, setPreparedSpells] = useState([]);

  const fetchPlayerClasses = () => {
    axios.get(`/api/classes`)
      .then(response => {
        setPlayerClasses(response.data);
      })
      .catch(error => {
        console.error(error);
      });
  };

  const fetchPlayerRaces = () => {
    axios.get(`/api/races`)
      .then(response => {
        setPlayerRaces(response.data);
      })
      .catch(error => {
        console.error(error);
      });
  };

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
    Name: characterName,
    Class: null,
    Level: 1,
    Background: null,
    Race: null,
    Alignment: null,
    ExperiencePoints: 0,

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
    Initiative: 1, // Determined by class
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

  const [addAmount, setAddAmount] = useState(0);
  const [spendAmount, setSpendAmount] = useState(0);

  const handleAddAmount = (currency, value) => {
    setAddAmount({ ...addAmount, [currency]: value });
  };

  const handleSpendAmount = (currency, value) => {
    setSpendAmount({ ...spendAmount, [currency]: value });
  };

  const handleWealthUpdate = (e) => {
    e.preventDefault();
    // Logic to update character's wealth based on addAmount and spendAmount
    const newWealth = { ...character.Wealth };
    for (const currency in newWealth) {
      newWealth[currency] += (parseInt(addAmount[currency]) || 0) - (parseInt(spendAmount[currency]) || 0);
    }
    setCharacter(prevState => ({
      ...prevState,
      Wealth: newWealth,
    }));
    // Clear addAmount and spendAmount
    setAddAmount(0);
    setSpendAmount(0);
    setIsModalShown(false)  // Close the modal once done.
    saveCharacter();  // Save character, since the user can't click the button anymore
  };

  // Get Equipped items from Inventory & prepared spells from Spellbook
  useEffect(() => {
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
    console.log("character.Name:", character.Name);
    axios.get(`/api/character`, { headers: headers })
    .then(response => {
      console.log('Fetched character data:', response.data);
      // Update the character state with the data from the server
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
        abilityScores,
        Wealth,
      }));

      setLoading(false);
    })
    .catch(error => {
      console.error(error);
    });
  }, [])

  // Log the character data whenever it changes
  useEffect(() => {
    console.log("Character Sheet:", character);
  }, [character]);


  function handleEdit(event, tileId) {
    // console.log('handleEdit called');
    // console.log('event:', event);
    // console.log('tileId:', tileId);
    event.stopPropagation();
    console.log('Editing tile:', tileId);
    setEditingTileId(tileId);
    setIsModalShown(true);
  }

  // This function will be called whenever the layout changes
  const handleLayoutChange = (layout, layouts) => {
    console.log(layout);
    localStorage.setItem('tileLayout', JSON.stringify(layouts));
  };

  const saveCharacter = () => {
    axios.put(`/api/character`, character, { headers: headers })
    .then(response => {
      console.log('Character saved successfully', response.status);
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
      const isProficient = proficiencies.includes(ability);
      savingThrows[ability.toLowerCase()] = abilityModifier + (isProficient ? proficiencyBonus : 0);
    }
    return savingThrows;
  }

  const handleEquipmentChange = (e) => {
    const selectedIndex = e.target.selectedIndex - 1; // -1 to exclude the disabled "Select item" option
    const selectedItem = character.Equipment[selectedIndex];
    setSelectedEquipment(selectedItem);
  };

  function formatFeatures(features, classData) {
    // console.log('formatFeatures- Features:', features);
    console.log('formatFeatures- Class Data:', classData);
    return features.map(feature => {
      const trait = classData.class_features[feature];
      console.log('Trait:', trait);
      return {
        name: feature,
        description: typeof trait === 'string'
          ? trait
          : trait.description
      };
    });
  }

  // Fetch character and race information from Flask and update character state
  useEffect(() => {
    const fetchClassData = character.Class ? axios.get(`/api/classes/${character.Class}`) : Promise.resolve(null);
    const fetchRaceData = character.Race ? axios.get(`/api/races/${character.Race}`) : Promise.resolve(null);
  
    Promise.all([fetchClassData, fetchRaceData])
      .then(([classResponse, raceResponse]) => {
        let newCharacterState = { ...character };
  
        if (classResponse) {
          const classData = classResponse.data;
          console.log('Class info from Flask-', classData);
  
          newCharacterState.HitPointMax = classData.hit_points.base + (character.Level * (classData.hit_points.level_increment + getModifier(character.abilityScores.constitution)));
  
          const features = [];
          for (let i = 0; i < character.Level; i++) {
            features.push(...classData.levels[i].features);
          }
          newCharacterState.Feats = formatFeatures(features, classData);
          newCharacterState.Proficiencies = [...classData.armor_proficiencies, ...classData.weapon_proficiencies];
        }
  
        if (raceResponse) {
          const raceData = raceResponse.data;
          console.log('Race info from Flask-', raceData);
  
          newCharacterState.Proficiencies = [...(newCharacterState.Proficiencies || []), ...raceData.languages];
          newCharacterState.Speed = raceData.speed;
          newCharacterState.Feats = [...(newCharacterState.Feats || []), ...Object.values(raceData.traits)];
        }
  
        setCharacter(newCharacterState);
      })
      .catch(error => {
        console.error(error);
      });
  }, [character.Class, character.Race, character.Level]);

  // Calculate Skill Levels
  useEffect(() => {
    const proficiencyBonus = calculateProficiencyBonus(character.Level);
    const Skills = Object.fromEntries(
      Object.entries(character.Skills).map(([skill, _]) => {
        const isProficient = character.Proficiencies.includes(skill);
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

    useEffect(() => {
    // Calculate Armor Class if equipment or Dexterity changes
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
        return character?.Name ? (
          <h1>{character.Name}</h1>
        ) : (
          <Placeholder as="h1" animation="glow" />
        );
      case 'Class':
        return (
          <>
            <div className="label">Class:</div>
            <h3 className="center">
              {character?.Class && character?.Level ? (
                `${character.Class} ${character.Level}`
              ) : (
                <>
                  <Placeholder as="span" animation="glow">
                    <Placeholder xs={6} />
                  </Placeholder>
                  <Placeholder as="span" animation="glow">
                    <Placeholder xs={2} />
                  </Placeholder>
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
      case 'ExperiencePoints':
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
      case 'HitPointMax':
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
      case 'CurrentHitPoints':
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
      case 'TemporaryHitPoints':
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
                character.Feats.map((feature, index) => (
                  <div key={index}>
                    <h4>{feature.name}</h4>
                    <p>{feature.description}</p>
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
                character.Attacks.map((attack) => (
                  <div key={attack.name}>
                    <h4>{attack.name}</h4>
                    <div>Bonus to Hit: {attack.bonusToHit}</div>
                    <div>Damage: {attack.damage} ({attack.damageType})</div>
                    <div>Range: {attack.range}</div>
                    {/* <div>Special Properties: </div> */}
                    <p/>
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
      case 'PassivePerception':
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
      case 'PersonalityTraits':
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
      case 'Flaws':
        return (
          <>
            <h4 className="center-title">Flaws</h4>
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
            <div key={tile.i} className="tile">
              <Paper elevation={3} style={{ height: '100%', padding: '10px', position: 'relative' }}>
                <div className="edit-icon" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                  <EditIcon onClick={(event) => handleEdit(event, tile.i)} />
                </div>
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
                case 'Background':
                case 'PersonalityTraits':
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
                case 'ExperiencePoints':
                case 'CurrentHitPoints':
                case 'TemporaryHitPoints':
                  return(
                    <Row>
                      <label>{editingTileId}</label>
                      <input
                      type="number"
                      value={character[editingTileId]}
                      onChange={e => {
                        setCharacter({
                          ...character,
                          [editingTileId]: e.target.value,
                        });
                      }}/>
                    </Row>
                  )
                case 'Class':
                  return(
                    <Form.Control as="select" value={character.Class} onChange={e => {
                      setCharacter({
                        ...character,
                        [editingTileId]: e.target.value,
                      });
                    }}>
                      <option value="" disabled>Select class</option>
                      {playerClasses.map(playerClass => (
                        <option key={playerClass} value={playerClass}>{playerClass}</option>
                      )) || <p>No classes defined</p>}
                    </Form.Control>
                  )
                case 'Race':
                  return(
                    <Form.Control as="select" value={character.Race} onChange={e => {
                      setCharacter({
                        ...character,
                        [editingTileId]: e.target.value,
                      });
                    }}>
                      <option value="" disabled>Select race</option>
                      {playerRaces.map(race => (
                        <option key={race} value={race}>{race}</option>
                      )) || <p>No races defined</p>}
                    </Form.Control>
                  )
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
                  return Object.entries(character.Skills).map(([skill, value]) => (
                    <Form.Check
                      type="checkbox"
                      key={skill}
                      label={`Proficient in ${skill}`}
                      checked={character.Proficiencies.includes(skill)}
                      onChange={e => {
                        if (e.target.checked) {
                          setCharacter({
                            ...character,
                            Proficiencies: [...character.Proficiencies, skill],
                          });
                        } else {
                          setCharacter({
                            ...character,
                            Proficiencies: character.Proficiencies.filter(proficiency => proficiency !== skill),
                          });
                        }
                      }}
                    />
                  ));
                case 'SavingThrows':
                  return Object.entries(character.SavingThrows).map(([Throw, value]) => (
                    <Form.Check
                      type="checkbox"
                      key={Throw}
                      label={`Proficient in ${Throw}`}
                      checked={character.Proficiencies.includes(Throw)}
                      onChange={e => {
                        if (e.target.checked) {
                          setCharacter({
                            ...character,
                            Proficiencies: [...character.Proficiencies, Throw],
                          });
                        } else {
                          setCharacter({
                            ...character,
                            Proficiencies: character.Proficiencies.filter(proficiency => proficiency !== Throw),
                          });
                        }
                      }}
                    />
                  ));
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
                                    const newAmount = parseInt(e.target.value) + (parseInt(addAmount[currency]) || 0);
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
                // case 'Attacks':
                //   const weapons = character.Equipment.filter(item => item.type === 'Weapon');
                //   return (
                //     <div>
                //       <h3>Standard Attacks</h3>
                //       <ul>
                //         <p>Attack - choose a weapon to use & roll a D20</p>
                //         <p>Grapple - Athletics check to restrain someone, with advantage. On the next turn, you can pin them.</p>
                //         <p>Shove - Athletics check to push someone within reach back by 1 square (5 feet), or knock them prone.</p>
                //         <p>Use Object - example: administering a potion to an ally</p>
                //         <p>Dash - Use the action on your turn to move</p>
                //         <p>Disengage - run away without getting hit</p>
                //         <p>Dodge - enemies have disadvantage attacking you</p>
                //         <p>Help - gives an ally advantage on an ability check</p>
                //         <p>Hide - make a stealth check to be hidden</p>
                //         <p>Ready - wait for a specific condition, then attack</p>
                //         <p>Search - Perception or Investigation check</p>
                //       </ul>
                //       {weapons.length > 0 ? (
                //         <ul>
                //           {weapons.map((weapon, index) => (
                //             <li key={index}>{weapon.name}</p>
                //           ))}
                //         </ul>
                //       ) : (
                //         <p>No weapons equipped.</p>
                //       )}
                //     </div>
                //   );
                case 'HitPointMax':
                  return (
                    <>
                       <p>Total HP = base + (Character Level) * (Level Increment + Constitution Modifier)</p>
                       <p>HP Per Level: {hitPoints.level_increment} + {getModifier(character.abilityScores.constitution)} (derived from {character.abilityScores.constitution} Constitution Score.)</p>
                      <p>Total HP = {hitPoints.base} + {character.Level} * (HP increase per level)</p>
                      <p>Total HP = {character.HitPointMax}</p>
                    </>
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
