import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Form } from 'react-bootstrap';
// import { Modal } from 'react-bootstrap';
import { Stepper, Step, StepButton, Button } from '@mui/material';
import { Dialog, DialogContent, DialogActions } from '@mui/material';
import { AppBar, Toolbar, IconButton, Typography, Box } from '@mui/material';
import {
    ABILITIES,
    POINT_COSTS,
    abilityDraftIsComplete,
    initialAbilityDrafts,
    pointBuyOptions,
    pointBuyRemaining,
    rollAbilityScore,
    standardArrayOptions,
} from './characterBuilderAbilities';
import {
    backgroundEquipment,
    normalizeStartingEquipment,
    selectedEquipmentList,
} from './characterBuilderEquipment';
import './CreateCharacterModal.css';

import CloseIcon from '@mui/icons-material/Close';

// A mapping of skills to their associated abilities
const skillAbilities = {
    'Acrobatics': 'dexterity',
    'Animal Handling': 'wisdom',
    'Arcana': 'intelligence',
    'Athletics': 'strength', 'Deception': 'charisma',
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

const alignments = ['Any Alignment', 'Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];

const humanizeLabel = (value) => String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const isNumberedCollection = (value) => value && typeof value === 'object' &&
    !Array.isArray(value) && Object.keys(value).length > 0 &&
    Object.keys(value).every((key) => /^\d+$/.test(key));

const DetailValue = ({ value }) => {
    if (value === null || value === undefined || value === '') return <span>—</span>;
    if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
    if (Array.isArray(value)) {
        if (value.length === 0) return <span>None</span>;
        return <ul className="character-builder-list">{value.map((item, index) => <li key={index}><DetailValue value={item} /></li>)}</ul>;
    }
    if (isNumberedCollection(value)) {
        return (
            <ul className="character-builder-list">
                {Object.values(value).map((item, index) => <li key={index}><DetailValue value={item} /></li>)}
            </ul>
        );
    }
    if (typeof value === 'object') {
        return (
            <div className="character-builder-detail-grid">
                {Object.entries(value).map(([key, nested]) => (
                    <section className="character-builder-detail-card" key={key}>
                        <h4>{humanizeLabel(key)}</h4>
                        <DetailValue value={nested} />
                    </section>
                ))}
            </div>
        );
    }
    return <span>{String(value)}</span>;
};

const SelectionDetails = ({ title, details, loading }) => {
    if (loading) return <p role="status">Loading {title.toLowerCase()} details…</p>;
    if (!details) return null;
    const entries = Object.entries(details);
    const description = entries.find(([key]) => /^description$/i.test(key))?.[1];
    const displayEntries = entries.filter(([key]) => {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return !['name', 'description', 'starter_equipment', 'starting_equipment', 'starting_equipment_options'].includes(normalized);
    });
    return (
        <section aria-label={`${title} details`} className="character-builder-selection-details">
            <h3>{title} details</h3>
            {description && <p className="character-builder-description">{description}</p>}
            <DetailValue value={Object.fromEntries(displayEntries)} />
        </section>
    );
};

const CreateCharacterModal = ({ show, setShow, onHide, headers }) => {
    const [activeStep, setActiveStep] = useState(0);
    const steps = ['Race', 'Class', 'Abilities', 'Description', 'Equipment', 'Summary'];
    const [completedSteps, setStepCompleted] = useState([false, false, false, false, false, false]);

    const handleClose = () => {
        setShow(false);
    };

    // Declare a new state variable to store the character data
    const [character, setCharacter] = useState({
        Name: null,
        system: 'D&D 5e',
        Class: null,
        Level: 1,
        Background: null,
        Race: null,
        Alignment: null,
        ExperiencePoints: 0,

        abilityScores: {
            strength: '',
            dexterity: '',
            constitution: '',
            intelligence: '',
            wisdom: '',
            charisma: '',
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

    const [selectedRace, setSelectedRace] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedBackground, setSelectedBackground] = useState('');
    const [selectionDetails, setSelectionDetails] = useState({ race: null, class: null, background: null });
    const [detailsLoading, setDetailsLoading] = useState({ race: false, class: false, background: false });

    const [selectedEquipment, setSelectedEquipment] = useState({});
    const [stepError, setStepError] = useState('');

    const classEquipmentOptions = normalizeStartingEquipment(selectionDetails.class);
    const fixedBackgroundEquipment = backgroundEquipment(selectionDetails.background);

    // Function to handle equipment selection
    const handleEquipmentSelection = (optionIndex, choice) => {
        setStepError('');
        setSelectedEquipment(prevState => ({
            ...prevState,
            [optionIndex]: choice,
        }));
    };

    const [races, setRaces] = useState([]);
    const [classes, setClasses] = useState([]);
    const [backgrounds, setBackgrounds] = useState([]);

    const requestConfig = () => {
        const system = headers?.System || character.system || 'D&D 5e';
        return { headers: { ...headers, System: system }, params: { system } };
    };

    const previewSelection = async (kind, name) => {
        const setters = { race: setSelectedRace, class: setSelectedClass, background: setSelectedBackground };
        setters[kind](name);
        setStepError('');
        if (kind === 'class') setSelectedEquipment({});
        setSelectionDetails((current) => ({ ...current, [kind]: null }));
        if (!name) return;

        setDetailsLoading((current) => ({ ...current, [kind]: true }));
        const endpoint = kind === 'class' ? 'classes' : `${kind}s`;
        try {
            const response = await axios.get(`/api/${endpoint}/${encodeURIComponent(name)}`, requestConfig());
            setSelectionDetails((current) => ({ ...current, [kind]: response.data }));
        } catch (error) {
            console.error(`Unable to load ${kind} details`, error);
            setSelectionDetails((current) => ({ ...current, [kind]: { error: 'Details could not be loaded.' } }));
        } finally {
            setDetailsLoading((current) => ({ ...current, [kind]: false }));
        }
    };

    // A state variable for the selected method of ability score generation
    const [method, setMethod] = useState('');
    const [abilityDrafts, setAbilityDrafts] = useState(initialAbilityDrafts);

    // Handle method changes
    const handleMethodChange = (event) => {
        const newMethod = event.target.value;
        setMethod(newMethod);
        setCharacter(prevState => ({
            ...prevState,
            abilityScores: newMethod ? { ...abilityDrafts[newMethod] } : { ...prevState.abilityScores }
        }));
    };

    const updateAbility = (ability, value) => {
        const nextScores = { ...abilityDrafts[method], [ability]: value };
        setAbilityDrafts((drafts) => ({ ...drafts, [method]: nextScores }));
        setCharacter((current) => ({ ...current, abilityScores: nextScores }));
    };

    // Handle ability score changes for manual entry
    const handleAbilityScoreChange = (event) => {
        console.log("Setting Ability Score " + event.target.name + " to " + event.target.value + "  by Dice Roll");
        const value = event.target.value;
        updateAbility(event.target.name, value === '' ? '' : Number(value));
    };

    const handleStandardArraySelection = (event) => {
        const { name, value } = event.target;
        updateAbility(name, value === '' ? '' : Number(value));
    };

    // Add a function to handle point buy selections
    const handlePointBuySelection = (event) => {
        console.log("Setting Ability Score " + event.target.name + " to " + event.target.value + " by Point Buy");
        updateAbility(event.target.name, Number(event.target.value));
    };

    const rollAllAbilities = () => {
        const scores = Object.fromEntries(ABILITIES.map((ability) => [ability, rollAbilityScore()]));
        setAbilityDrafts((drafts) => ({ ...drafts, dice: scores }));
        setCharacter((current) => ({ ...current, abilityScores: scores }));
    };

    // Get Race, Class, and Background data from the server
    useEffect(() => {
        const fetchData = async () => {
            try {
                const systemHeader = headers?.System || 'D&D 5e';
                const requestHeaders = { ...headers, System: systemHeader };
                const requestParams = { system: systemHeader };

                const [racesResponse, classesResponse, backgroundsResponse] = await Promise.all([
                    axios.get('/api/races', { headers: requestHeaders, params: requestParams }),
                    axios.get('/api/classes', { headers: requestHeaders, params: requestParams }),
                    axios.get('/api/backgrounds', { headers: requestHeaders, params: requestParams })
                ]);
    
                console.log("CreateCharacter- Races-", racesResponse.data);
                const sortedRaces = racesResponse.data.sort((a, b) => a.name.localeCompare(b.name));
                setRaces(sortedRaces);
    
                console.log("CreateCharacter- Classes-", classesResponse.data);
                const sortedClasses = classesResponse.data.sort((a, b) => a.name.localeCompare(b.name));
                setClasses(sortedClasses);
    
                console.log("CreateCharacter- Backgrounds-", backgroundsResponse.data);
                const sortedBackgrounds = backgroundsResponse.data.sort((a, b) => a.name.localeCompare(b.name));
                setBackgrounds(sortedBackgrounds);
            } catch (error) {
                console.error(error);
            }
        };
    
        fetchData();
    }, [headers]);

    useEffect(() => {
        console.log("Updated Character-", character);
    }, [character]);

    // Save the completed character
    const handleCreateCharacter = () => {
        const scores = character.abilityScores;
        const wealth = character.Wealth || {};
        const payload = {
            ...character,
            character_name: character.Name,
            campaignID: headers?.CampaignID || headers?.['Campaign-ID'] || null,
            system: character.system || 'D&D 5e',
            ...scores,
            ...wealth,
        };
        const requestHeaders = { ...headers, System: payload.system };

        axios.post('/api/characters', payload, { headers: requestHeaders })
            .then((response) => {
                console.log(response);
                onHide();
            })
            .catch((error) => {
                console.error(error);
            });
    };

    // Update the character state when the user types in the form
    const handleInputChange = (event) => {
        setStepError('');
        setCharacter((current) => ({
            ...current,
            [event.target.name]: event.target.value,
        }));
    };


    // Buttons for controlling the stepper
    const handleReset = () => {
        setActiveStep(0);
        setStepCompleted(steps.map(() => false));
    };

    const handleComplete = () => {
        let canComplete = false;
        let updatedCharacter = { ...character };

        switch (activeStep) {
            case 0: // Race step
                canComplete = selectedRace !== '';
                if (canComplete) {
                    updatedCharacter.Race = selectedRace;
                }
                break;
            case 1: // Class step
                canComplete = selectedClass !== '';
                if (canComplete) {
                    updatedCharacter.Class = selectedClass;
                }
                break;
            case 2: // Attributes step
                canComplete = abilityDraftIsComplete(method, abilityDrafts[method] || {});
                console.log("Saved Ability Scores-", character.abilityScores);
                break;
            case 3: // Character details step
                canComplete = selectedBackground !== '' &&
                    Boolean(character.Name?.trim()) &&
                    Boolean(character.Alignment);
                if (canComplete) {
                    updatedCharacter.Background = selectedBackground;
                }
                break;
            case 4: // Equipment step
                canComplete = classEquipmentOptions.every((option, index) =>
                    !option.requiresSelection || Boolean(selectedEquipment[index])
                );
                updatedCharacter.Equipment = selectedEquipmentList(
                    classEquipmentOptions,
                    selectedEquipment,
                    fixedBackgroundEquipment,
                );
                break;
            case 5: // Equipment step
                canComplete = true;
                break;
            default:
                break;
        }

        if (canComplete) {
            setStepError('');
            setCharacter(updatedCharacter);
            const newCompletedSteps = [...completedSteps];
            newCompletedSteps[activeStep] = true;
            setStepCompleted(newCompletedSteps);
            setActiveStep((current) => Math.min(current + 1, steps.length - 1));
        } else {
            const messages = [
                'Choose a race before completing this step.',
                'Choose a class before completing this step.',
                'Complete all six ability scores before continuing.',
                'Enter a name, background, and alignment before continuing.',
                'Choose one item from each required starting-equipment group.',
            ];
            setStepError(messages[activeStep] || 'Complete the required fields before continuing.');
        }
    };

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

    // Calcualte Saving Throw values
    useEffect(() => {
        const savingThrows = calculateSavingThrows(character.abilityScores, character.proficiencyBonus, character.Proficiencies);
        setCharacter(prevState => ({
            ...prevState,
            SavingThrows: savingThrows,
        }));
    }, [character.abilityScores, character.proficiencyBonus, character.Proficiencies]);


    return (
        <Dialog open={show} maxWidth="md" onClose={handleClose} style={{overflow: 'hidden'}}>
            <DialogContent>
                <AppBar sx={{ position: 'relative' }}>
                    <Toolbar>
                        <IconButton
                            edge="start"
                            color="inherit"
                            onClick={handleClose}
                            aria-label="close"
                        >
                            <CloseIcon />
                        </IconButton>
                        <Typography variant="h6" sx={{ flex: 1 }}>
                            Create a New Character
                        </Typography>
                    </Toolbar>
                </AppBar>
                {/* Race */}
                {activeStep === 0 && (
                    <div className="character-builder-step">
                        <h2>Race</h2>
                        <Form.Group controlId="characterRace">
                            <Form.Select
                                aria-label="Race selection"
                                value={selectedRace}
                                onChange={(e) => previewSelection('race', e.target.value)}
                            >
                                <option value="">--Choose A Race--</option>
                                {races.map((elem, index) => (
                                    <option key={`race-${index}`} value={elem.name}>{elem.name}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <div style={{ height: '10px' }}></div>
                        <SelectionDetails title={selectedRace} details={selectionDetails.race} loading={detailsLoading.race} />
                    </div>
                )}
                {/* Class */}
                {activeStep === 1 && (
                    <div className="character-builder-step">
                        <h2>Class</h2>
                        <Form.Group controlId="characterClass" style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
                            <Form>
                                <Form.Group controlId="classSelection">
                                    <Form.Label>Class Selection</Form.Label>
                                    <Form.Select
                                        aria-label="Class selection"
                                        value={selectedClass}
                                        onChange={(e) => previewSelection('class', e.target.value)}
                                    >
                                        <option value="">--Choose A Class--</option>
                                        {classes.map((elem, index) => (
                                            <option key={`class-${index}`} value={elem.name}>{elem.name}</option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>
                                <div style={{ height: '10px' }}></div>
                                <SelectionDetails title={selectedClass} details={selectionDetails.class} loading={detailsLoading.class} />
                            </Form>
                        </Form.Group>
                    </div>
                )}
                {/* Attributes */}
                {activeStep === 2 && (
                    <div className="character-builder-step">
                        <h2>Ability Scores</h2>
                        <Form.Group controlId="generationMethod">
                            <Form.Label>Generation Method</Form.Label>
                            <Form.Control as="select" value={method} onChange={handleMethodChange}>
                                <option value="">--Choose a Generation Method--</option>
                                <option value="standard">Standard Array</option>
                                <option value="dice">Dice Roll</option>
                                <option value="point">Point Buy</option>
                            </Form.Control>
                        </Form.Group>
                        {method === 'point' && <p><strong>Remaining Points: {pointBuyRemaining(abilityDrafts.point)}</strong></p>}
                        {method === 'dice' && (
                            <Button onClick={rollAllAbilities} variant="outlined" sx={{ my: 1 }}>
                                Roll all (4d6, drop lowest)
                            </Button>
                        )}
                        {ABILITIES.map((ability) => (
                            <Form.Group key={ability} controlId={ability}>
                                <Form.Label>{ability[0].toUpperCase() + ability.slice(1)}</Form.Label>
                                {method === 'dice' && (
                                    <Form.Control type="number" min="3" max="18" name={ability} value={abilityDrafts.dice[ability]} onChange={handleAbilityScoreChange} />
                                )}
                                {method === 'point' && (
                                    <Form.Control as="select" name={ability} value={abilityDrafts.point[ability]} onChange={handlePointBuySelection}>
                                        {pointBuyOptions(abilityDrafts.point, ability).map((score) => (
                                            <option key={score} value={score}>{score} (Cost: {POINT_COSTS[score]})</option>
                                        ))}
                                    </Form.Control>
                                )}
                                {method === 'standard' && (
                                    <Form.Control as="select" name={ability} value={abilityDrafts.standard[ability]} onChange={handleStandardArraySelection}>
                                        <option value="">--Choose--</option>
                                        {standardArrayOptions(abilityDrafts.standard, ability).map((score) => (
                                            <option key={score} value={score}>{score}</option>
                                        ))}
                                    </Form.Control>
                                )}
                            </Form.Group>
                        ))}
                        {method && !abilityDraftIsComplete(method, abilityDrafts[method]) && (
                            <p className="text-muted">Complete all six scores to finish this step.</p>
                        )}
                    </div>
                )}
                {/* Description */}
                {activeStep === 3 && (
                    <div className="character-builder-step">
                        <Form.Group controlId="characterName">
                            <Form.Label>Character Name</Form.Label>
                            <Form.Control type="text" name="Name" value={character.Name || ''} onChange={handleInputChange} required />
                        </Form.Group>
                        <Form.Group controlId="characterLevel">
                            <Form.Label>Starting Level</Form.Label>
                            <Form.Control type="number" min="1" max="20" name="Level" value={character.Level} onChange={handleInputChange} required />
                        </Form.Group>
                        <Form.Group controlId="characterBackground">
                            <Form.Label>Background</Form.Label>
                            <Form.Control
                                as="select"
                                name="Background"
                                value={selectedBackground}
                                onChange={(e) => previewSelection('background', e.target.value)}
                                required
                            >
                                <option value="">--Choose--</option>
                                {backgrounds.map((elem, index) => (
                                    <option key={`background-${index}`} value={elem.name}>{elem.name}</option>
                                ))}
                            </Form.Control>
                        </Form.Group>
                        <div style={{ height: '10px' }}></div> {/* This div will create some space */}
                        <SelectionDetails title={selectedBackground} details={selectionDetails.background} loading={detailsLoading.background} />
                        <Form.Group>
                            <Form.Label>Alignment</Form.Label>
                            <Form.Control
                                as="select"
                                value={character.Alignment || ''}
                                onChange={handleInputChange}
                                name="Alignment"
                            >
                                <option value="" disabled>Select alignment</option>
                                {alignments.map(alignment => (
                                    <option key={alignment} value={alignment}>{alignment}</option>
                                ))}
                            </Form.Control>
                        </Form.Group>
                    </div>
                )}
                {/* Equipment */}
                {activeStep === 4 && (
                    <div className="character-builder-step">
                        <h2>Starting Equipment</h2>
                        <p className="text-muted">Choose the equipment supplied by your class. Fixed class and background items are included automatically.</p>
                        {selectedClass && classEquipmentOptions.length > 0 && (
                            <div className="character-builder-equipment-grid">
                                {classEquipmentOptions.map((option, index) => {
                                    const complete = !option.requiresSelection || Boolean(selectedEquipment[index]);
                                    return (
                                        <section className={`character-builder-equipment-card${complete ? ' is-complete' : ''}`} key={option.id}>
                                            <p><strong>{option.description}</strong></p>
                                            {option.requiresSelection ? (
                                                <Form.Group aria-label={`Equipment option ${index + 1}`}>
                                                    {option.choices.map((choice, choiceIndex) => (
                                                        <Form.Check
                                                            type="radio"
                                                            id={`equipment-option-${index}-${choiceIndex}`}
                                                            name={`equipment-option-${index}`}
                                                            key={`${option.id}-${choiceIndex}`}
                                                            label={choice}
                                                            value={choice}
                                                            checked={selectedEquipment[index] === choice}
                                                            onChange={(event) => handleEquipmentSelection(index, event.target.value)}
                                                        />
                                                    ))}
                                                </Form.Group>
                                            ) : (
                                                <ul className="character-builder-list">
                                                    {option.choices.map((choice) => <li key={choice}>{choice}</li>)}
                                                </ul>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        )}
                        {selectedClass && !detailsLoading.class && classEquipmentOptions.length === 0 && (
                            <p>No starting-equipment choices are required for this class.</p>
                        )}
                        {fixedBackgroundEquipment.length > 0 && (
                            <section className="character-builder-background-equipment">
                                <h3>From {selectedBackground}</h3>
                                <ul className="character-builder-list">
                                    {fixedBackgroundEquipment.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
                {/* Summary */}
                {activeStep === 5 && (
                    <div className="character-builder-step">
                        <h2>Character Summary</h2>
                        <div className="character-builder-summary-identity">
                            <h3>{character.Name || 'Unnamed character'}</h3>
                            <p>{character.Race} {character.Class} · Level {character.Level} · {character.Background}</p>
                            <p>{character.Alignment}</p>
                        </div>
                        <div className="character-builder-detail-grid">
                            <section className="character-builder-detail-card">
                                <h4>Ability Scores</h4>
                                <DetailValue value={character.abilityScores} />
                            </section>
                            <section className="character-builder-detail-card">
                                <h4>Starting Equipment</h4>
                                <DetailValue value={character.Equipment} />
                            </section>
                            <section className="character-builder-detail-card">
                                <h4>Combat</h4>
                                <DetailValue value={{
                                    armor_class: character.ArmorClass,
                                    initiative: character.Initiative,
                                    speed: character.Speed,
                                    hit_point_maximum: character.HitPointMax,
                                    proficiency_bonus: character.proficiencyBonus,
                                }} />
                            </section>
                            <section className="character-builder-detail-card">
                                <h4>Wealth</h4>
                                <DetailValue value={character.Wealth} />
                            </section>
                        </div>
                    </div>
                )}
                {stepError && <p className="character-builder-step-error" role="alert">{stepError}</p>}
            </DialogContent>
            <DialogActions>
                <Stepper activeStep={activeStep} alternativeLabel nonLinear sx={{ flex: 1 }}>
                    {steps.map((label, index) => (
                        <Step key={label} completed={completedSteps[index]}>
                            <StepButton onClick={() => setActiveStep(index)} completed={completedSteps[index]}>
                                <Typography
                                    component="span"
                                    sx={{ textDecoration: completedSteps[index] ? 'line-through' : 'none' }}
                                >
                                    {label}
                                </Typography>
                            </StepButton>
                        </Step>
                    ))}
                </Stepper>
                {completedSteps.every(step => step) ? (
                    <React.Fragment>
                        <Typography sx={{ mt: 2, mb: 1 }}>
                            All steps completed - you're finished
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
                            <Button variant="contained" onClick={handleCreateCharacter}>Create Character</Button>
                            <Button onClick={handleReset}>Reset</Button>
                        </Box>
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
                            <Button onClick={handleComplete}>
                                {completedSteps[activeStep] ? 'Update Step' : 'Complete Step'}
                            </Button>
                        </Box>
                    </React.Fragment>
                )}
            </DialogActions>
        </Dialog>
    );
}

export default CreateCharacterModal;
