import React, { useState, useEffect, useRef } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { Row, Col, Button, ButtonGroup, Modal, ModalDialog, Form, Table } from 'react-bootstrap';


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
  { i: 'Name', x: 0, y: 0, w: 2, h: 4 },
  { i: 'Class', x: 2, y: 0, w: 1, h: 3 },
  { i: 'Race', x: 2, y: 3, w: 1, h: 3 },
  { i: 'Alignment', x: 3, y: 0, w: 1, h: 4 },
  { i: 'Ability Scores', x: 0, y: 3, w: 1, h: 20 },
  { i: 'Proficiency Bonus', x: 1, y: 3, w: 1, h: 3 },
  { i: 'Saving Throws', x: 1, y: 6, w: 1, h: 12 },
  { i: 'Skills', x: 3, y: 14, w: 2, h: 19 },
  { i: 'PersonalityTraits', x: 5, y: 30, w: 2, h: 4 },
  { i: 'Ideals', x: 0, y: 31, w: 2, h: 4 },
  { i: 'Bonds', x: 0, y: 35, w: 2, h: 4 },
  { i: 'Flaws', x: 3, y: 33, w: 2, h: 5 },
  { i: 'Feats', x: 5, y: 0, w: 2, h: 9 },
  { i: 'Attacks', x: 5, y: 9, w: 2, h: 7 },
  { i: 'Spells', x: 5, y: 23, w: 2, h: 7 },
  { i: 'Equipment', x: 5, y: 16, w: 2, h: 7 },
  { i: 'Proficiencies', x: 1, y: 19, w: 2, h: 12 },
  { i: 'Wealth', x: 2, y: 12, w: 1, h: 7 },
  { i: 'Initiative', x: 3, y: 6, w: 1, h: 3 },
  { i: 'Speed', x: 4, y: 3, w: 1, h: 3 },
  { i: 'Armor Class', x: 2, y: 6, w: 1, h: 3 },
  { i: 'Background', x: 3, y: 4, w: 1, h: 3 },
  { i: 'ExperiencePoints', x: 4, y: 0, w: 1, h: 4 },
  { i: 'PassivePerception', x: 3, y: 12, w: 2, h: 2 },
  { i: 'HitPointMax', x: 2, y: 9, w: 1, h: 3 },
  { i: 'CurrentHitPoints', x: 3, y: 9, w: 1, h: 3 },
  { i: 'TemporaryHitPoints', x: 4, y: 9, w: 1, h: 3 }
];

const defaultLayout = {
  lg: tiles,
  md: tiles,
  sm: tiles,
  xs: tiles,
  xxs: tiles,
};

function CharacterSheet({ headers, characterName }) {
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
  const [preparedSpells, setPreparedSpells] = useState([]);

  // Fetch the list of player classes & races from the server when the component mounts
  useEffect(() => {
    console.log("CharacterSheet- characterName:", characterName);
    axios.get(`/api/classes`)
      .then(response => {
        // console.log("Classes from Flask- response.data:", response.data);
        setPlayerClasses(response.data);
      })
      .catch(error => {
        // error case
        console.error(error);
      });
    axios.get(`/api/races`)
    .then(response => {
      // console.log("Races from Flask- response.data:", response.data);
      setPlayerRaces(response.data);
    })
    .catch(error => {
      // error case
      console.error(error);
    });
  }, [headers]);

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
    Level: null,
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
    PassivePerception: null, // wisdom
    Proficiencies: [''],   // Determined by class and race

    ArmorClass: 10, // 10 + Dex Mod, if unarmored. Otherwise use equipment list
    Initiative: 1, // Determined by class
    Speed: 30, // Determined by Race
    HitPointMax: 0,  // Determined by Con mod & class
    CurrentHitPoints: 0,
    TemporaryHitPoints: 0,   // These deplete over time?
    Attacks: [''],  // Determined by class? And equipement. Pre-populate with the generic actions
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
  });

  // useEffect(() => {
  //   setCharacter(prevCharacter => ({
  //     ...prevCharacter,
  //     Name: characterName
  //   }));
  // }, [characterName]);

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
    setCharacter({
      ...character,
      Wealth: newWealth,
    });
    // Clear addAmount and spendAmount
    setAddAmount(0);
    setSpendAmount(0);
    setIsModalShown(false)  // Close the modal once done.
    saveCharacter();  // Save character, since the user can't click the button anymore
  };

  // Get Equipped item from Inventory
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
      // error case
      console.error(error);
      // setEquipment(); // use defaults
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

  // Fetch the character data from the server when the component mounts
  useEffect(() => {
    console.log("character.Name:", character.Name);
    axios.get(`/api/character`, { headers: headers })
    .then(response => {
      console.log('Fetched character data:', response.data);
      // Update the character state with the data
      // Should this just overwrite with the updated version?
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

      setCharacter(prevState => {
        return {
          ...prevState,
          ...rest,
          abilityScores,
          Wealth,
        };
      });
    })
    .catch(error => {
      // error case
      console.error(error);
    });
  }, [])

  useEffect(() => {
    console.log("Character:", character);
  }, [character]);


  function handleEdit(event, tileId) {
    console.log('handleEdit called');
    console.log('event:', event);
    console.log('tileId:', tileId);
    event.stopPropagation();
    console.log('Editing tile:', tileId);
    setEditingTileId(tileId);
    setIsModalShown(true);
  }

  // This function will be called whenever the layout changes
  const handleLayoutChange = (layout, layouts) => {
    // console.log(layout);
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

  function formatFeatures(features, classData) {
    return features.map(feature => ({
      name: feature,
      description: typeof classData.class_features[feature] === 'string'
        ? classData.class_features[feature]
        : classData.class_features[feature].description
    }));
  }

  const handleEquipmentChange = (e) => {
    const selectedIndex = e.target.selectedIndex - 1; // -1 to exclude the disabled "Select item" option
    const selectedItem = character.Equipment[selectedIndex];
    setSelectedEquipment(selectedItem);
  };

  useEffect(() => {
    let tempProficiencies = [];

    if (character.Class) {
      axios.get(`/api/classes/${character.Class}`)
        .then(response => {
          // console.log('Class info from Flask- response.data:', response.data);
          setHitPoints( response.data.hit_points );
          const hpPerLevel = response.data.hit_points.level_increment + getModifier(character.abilityScores.constitution);
          const hitPointMax = response.data.hit_points.base + (character.Level * hpPerLevel);
          // console.log("hitPointMax:", hitPointMax);

          const features = [];
          for (let i = 0; i < character.Level; i++) {
            features.push(...response.data.levels[i].features);
          }
          const formattedFeatures = formatFeatures(features, response.data);

          tempProficiencies = [...tempProficiencies, ...response.data.armor_proficiencies, ...response.data.weapon_proficiencies];

          if (character.Race) {
            axios.get(`/api/races/${character.Race}`)
              .then(response => {
                // console.log('Race info from Flask- response.data:', response.data);
                tempProficiencies = [...tempProficiencies, ...Object.values(response.data.traits)];

                setCharacter(prevState => ({
                  ...prevState,
                  Proficiencies: tempProficiencies,
                  HitPointMax: hitPointMax,
                  Attacks: response.data.class_features,
                  Speed: response.data.speed,
                  Feats: formattedFeatures
                }));
              });
          }
        })
        .catch(error => {
          // error case
          console.error(error);
        });
    }
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
    setCharacter(prevState => ({
      ...prevState,
      proficiencyBonus,
      Skills,
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
  // TODO- Add logic for shields and other items that can affect AC
  const calculateArmorClass = (equipment, dexterity) => {
    const hasArmor = equipment.some(item => item.type === 'Armor');
    const dexMod = getModifier(dexterity);

    if (hasArmor) {
      const armor = equipment.find(item => item.type === 'Armor');
      let armorClass = armor.AC;
      if (armor.type === 'Light Armor') {
        armorClass += dexMod;
      } else if (armor.type === 'Medium Armor') {
        armorClass += Math.min(dexMod, 2);
      }
      return armorClass;
    }
    return 10 + dexMod;
  }

  useEffect(() => {
    const armorClass = calculateArmorClass(character.Equipment, character.abilityScores.Dexterity);
    setCharacter(prevState => ({
      ...prevState,
      ArmorClass: armorClass
    }));
  }, [character.Equipment, character.abilityScores.Dexterity]);


  // Calculate Attack Options
  const determineBonusToHit = (weapon) => {
    let mod = 0;
    const weaponType = weapon['type'];

    if (["simple melee", "martial melee", "melee"].includes(weaponType)) {
      mod = character.abilityScores.Strength;
    } else if (["simple ranged", "martial ranged", "ranged"].includes(weaponType)) {
      mod = character.abilityScores.Dexterity;
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

    if (["simple melee", "martial melee"].includes(weapon.weapon_type)) {
      mod = character.abilityScores.Strength;
    } else if (["simple ranged", "martial ranged"].includes(weapon.weapon_type)) {
      mod = character.abilityScores.Dexterity;
    }

    return `${baseDamage} + ${mod}`;
  };

  const renderAttacks = () => {
    const attacks = [];

    // Add generic moves to attacks (assuming you have them in an array or something similar)
    // genericMoves.forEach(move => {
    //   attacks.push(move);
    // });

    // Add equipped weapons to attacks
    character.Equipment.filter(item => item.type === 'Weapon' && item.equipped).forEach(weapon => {
      attacks.push({
        name: weapon.name,
        bonusToHit: determineBonusToHit(weapon),
        damage: determineDamage(weapon),
        damageType: weapon.damage_type,
        range: weapon.weapon_range
      });
    });

    return attacks;
  };

  // In your component's render method
  const attacks = renderAttacks();

  function generateTileContent(tileId) {
    switch (tileId) {
      case 'Name':
        return (<h1 className="h1">{character.Name}</h1>);
      case 'Class':
        return (
          <>
            <div className="label">Class:</div>
            <div>{character.Class} {character.Level}</div>
          </>
        );
      case 'Background':
        return (
          <>
            <div className="label">Background</div>
            <div>{character.Background}</div>
        </>
      );
      case 'ExperiencePoints':
        return (
          <>
            <div className="label">XP</div>
            <div>{character.ExperiencePoints} / {character.pointsToNextLevel}</div>
          </>
        );
      case 'Race':
        return (
          <>
            <div className="label">Race:</div>
            <div>{character.Race}</div>
          </>
        );
      case 'Alignment':
        return (
          <>
            <div className="label">Alignment:</div>
            <div>{character.Alignment}</div>
          </>
        );
      case 'Ability Scores':
        return (
          <div>
            {Object.entries(character.abilityScores).map(([score, value]) => (
              <div key={score} className="ability-score-container">
                <p className="label">{`${score}:`}</p>
                <div className="ability-score-value">
                  <h3>{`${value}`}</h3>
                </div>
              </div>
            ))}
          </div>
        );
      case 'Proficiency Bonus':
        return (
          <div>
            <span className="label">Proficiency Bonus:</span>
            <span>{character.proficiencyBonus}</span>
          </div>
        );
      case 'Saving Throws':
        return (
          <>
            <h3>Saving Throws:</h3>
            {Object.entries(character.SavingThrows).map(([score, value]) => (
              <p>
              <span key={score} className="label">{`${score}:`}</span>
              <span>{`${value}`}</span>
              </p>
            ))}
          </>
        );
      case 'Initiative':
        return (
          <div>
            <span className="label">Initiative:</span>
            <p>{character.Initiative}</p>
          </div>
        );
      case 'Speed':
        return (
          <div>
            <span className="label">Speed:</span>
            <p>{character.Speed}</p>
          </div>
        );
      case 'Armor Class':
        return (
          <div>
            <span className="label">Armor Class:</span>
            <h3>{character.ArmorClass}</h3>
          </div>
        );
      case 'HitPointMax':
        return (
          <div>
            <span className="label">Max HP</span>
            <p>{character.HitPointMax}</p>
          </div>
        );
      case 'CurrentHitPoints':
        return (
          <>
            <span className="label">Current HP</span>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <h3>{character.CurrentHitPoints}</h3>
            </div>
          </>
        );
      case 'TemporaryHitPoints':
        return (
          <div>
            <span className="label">Temporary HP</span>
            <span>{character.TemporaryHitPoints}</span>
        </div>
      );
      case 'Skills':
        return (
          <>
            <h3>Skills:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {Object.entries(character.Skills).map(([skill, score]) => (
                <div className="skill-row">
                  <span key={skill}>{skill}: {score}</span>
                  <span className="label-right">{skillAbilities[skill]}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'Feats':
        return(
          <>
            <h3>Feats:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {Array.isArray(character.Feats) ? character.Feats.map((feature, index) => (
                <div key={index}>
                  <h4>{feature.name}</h4>
                  <p>{feature.description}</p>
                </div>
              )) : <p>No Feats defined.</p>}
            </div>
          </>
        );
      case 'Attacks':
        return (
          <>
            <h3>Attacks:</h3>
            <div style={{ overflow: 'auto', height: '100%' }}>
              {Array.isArray(character.Attacks) ? character.Attacks.map((attack, index) => (
                <div key={attack.name}>
                  <h3>{attack.name}</h3>
                  <p>Bonus to Hit: {attack.bonusToHit}</p>
                  <p>Damage: {attack.damage} ({attack.damageType})</p>
                  <p>Range: {attack.range}</p>
                  <p>Special Properties: </p>
                </div>
              )) : <p>No Attacks defined.</p>}
            </div>
          </>
        );
      case 'Spells':
        return (
        <div>
          <h3>Spells:</h3>
          {character.Spells.map((spell, index) => (
            <p key={index}>{spell}</p>
          ))}
        </div>);
      case 'Equipment':
        return (
          <>
            <h3>Equipment:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character.Equipment.map((item, index) => (
                <p key={index}>{item.name}</p>
              ))}
            </div>
          </>
        );
      case 'Proficiencies':
        return(
          <>
            <h3>Proficiencies:</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 33px)' }}>
              {character.Proficiencies.map((proficiency, index) => (
                <p key={index}>{proficiency}</p>
              ))}
            </div>
          </>
        );
      case 'PassivePerception':
        return (
          <>
            <p className="label">Passive Perception</p>
            <p>{character.PassivePerception}</p>
        </>
      );
      case 'Wealth':
        return(
          <div>
            <h3>Wealth:</h3>
            {Object.entries(character.Wealth).map(([currency, amount]) => (
              <div>
                <span key={currency} className="label">{currency}:</span>
                <span>{amount}</span>
              </div>
            ))}
          </div>
        );
      case 'PersonalityTraits':
        return (
          <>
            <p className="label">Personality Traits:</p>
            <p>{character.PersonalityTraits}</p>
          </>
        );
      case 'Ideals':
        return (
          <>
            <p className="label">Ideals</p>
            <p>{character.Ideals}</p>
          </>
        );
      case 'Bonds':
        return (
          <>
            <p className="label">Bonds</p>
            <p>{character.Bonds}</p>
          </>
        );
      case 'Flaws':
        return (
          <>
            <p className="label">Flaws</p>
            <p>{character.Flaws}</p>
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
            <div
              key={tile.i}
              className="tile"
            >
              <div className="edit-icon">
                <EditIcon onClick={(event) => handleEdit(event, tile.i)} />
              </div>
              {generateTileContent(tile.i)}
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
                  const dexMod = getModifier(character.abilityScores.Dexterity);
                  const armorClass = calculateArmorClass(equipment, character.abilityScores.Dexterity);
                  let explanation = "";

                  const hasArmor = equipment.some(item => item.type === 'Armor');
                  if (hasArmor) {
                    const armor = equipment.find(item => item.type === 'Armor');
                    explanation = `You have ${armor.name} equipped, which grants an Armor Class of ${armor.AC}.`;
                    if (armor.type === 'Light Armor') {
                      explanation += ` As it's Light Armor, your Dexterity modifier of ${dexMod} is added, giving you a total Armor Class of ${armorClass}.`;
                    } else if (armor.type === 'Medium Armor') {
                      const appliedDexMod = Math.min(dexMod, 2);
                      explanation += ` As it's Medium Armor, a Dexterity modifier of up to +2 is added. Your Dexterity modifier is ${dexMod}, so an additional ${appliedDexMod} is added, giving you a total Armor Class of ${armorClass}.`;
                    } else {
                      explanation += ` Heavy Armor doesn't add the Dexterity modifier, so your total Armor Class remains ${armorClass}.`;
                    }
                  } else {
                    explanation = `You don't have any armor equipped. Your base Armor Class is 10 and your Dexterity modifier of ${dexMod} is added, giving you a total Armor Class of ${armorClass}.`;
                  }

                  return <p>{explanation}</p>;
                }
                case 'Attacks':
                  return(
                    <p>Coming Soon!</p>
                  )
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
