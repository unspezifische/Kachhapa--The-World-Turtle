import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Form } from 'react-bootstrap';
// import { Modal } from 'react-bootstrap';
import { Modal } from '@mui/material';
import { Stepper, Step, StepButton, Button, FormControl, InputLabel, Select } from '@mui/material';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { AppBar, Toolbar, IconButton, Typography, Box } from '@mui/material';

import CloseIcon from '@mui/icons-material/Close';


const CreateCharacterModal = ({ show, setShow, onHide, headers }) => {
    const [activeStep, setActiveStep] = useState(0);
    const [steps, setSteps] = useState(['Race', 'Class', 'Abilities', 'Description', 'Equipment', 'Summary']);  // Eventually, get this info from the database based on the System
    const [completedSteps, setStepCompleted] = useState([false, false, false, false, false, false]);
    const [completed, setCompleted] = useState(false);

    const handleClose = () => {
        setShow(false);
    };

    useEffect(() => {
        setCompleted(completedSteps.every(step => step));
    }, [completedSteps]);

    // Declare a new state variable to store the character data
    const [character, setCharacter] = useState({
        Name: null,
        system: 'D&D 5e',
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

    const [selectedRace, setSelectedRace] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedBackground, setSelectedBackground] = useState('');
    const [attributes, setAttributes] = useState('');  // This will be a list of the selected attributes [str, dex, con, int, wis, cha
    const [equipement, setEquipment] = useState('');

    const [races, setRaces] = useState([]);
    const [classes, setClasses] = useState([]);
    const [backgrounds, setBackgrounds] = useState([]);

    // Add a new state variable for the selected method of ability score generation
    const [method, setMethod] = useState('Choose');

    // Add a function to handle method changes
    const handleMethodChange = (event) => {
        setMethod(event.target.value);
    };

    // Add a function to handle ability score changes
    const handleAbilityScoreChange = (event) => {
        const selectedValue = parseInt(event.target.value);
        setCharacter(prevState => ({
            ...prevState,
            abilityScores: {
                ...prevState.abilityScores,
                [event.target.name]: selectedValue,
            }
        }));
    };

    // Add new state variables for the ability scores and the standard array
    const [standardArray, setStandardArray] = useState([15, 14, 13, 12, 10, 8]);

    // Add a function to handle standard array selections
    const handleStandardArraySelection = (event) => {
        const ability = event.target.name;
        const selectedValue = parseInt(event.target.value);
        const previousValue = character.abilityScores[ability];

        // If the ability score had a previous value, add it back to the standard array
        if (previousValue) {
            setStandardArray([...standardArray, previousValue]);
        }

        // Update the ability score in the character state
        setCharacter(prevState => ({
            ...prevState,
            abilityScores: {
                ...prevState.abilityScores,
                [ability]: selectedValue,
            }
        }));

        // Remove the selected value from the standard array
        setStandardArray(standardArray.filter(item => item !== selectedValue));
    };

    const [remainingPoints, setRemainingPoints] = useState(27);
    const pointCosts = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

    // Add a function to handle point buy selections
    const handlePointBuySelection = (event) => {
        const selectedValue = parseInt(event.target.value);
        const previousValue = character.abilityScores[event.target.name] || 8;
        const pointsUsed = pointCosts[selectedValue] - pointCosts[previousValue];
        console.log('Points used:', pointsUsed);
        if (remainingPoints - pointsUsed >= 0) {
            const selectedValue = parseInt(event.target.value);
            setCharacter(prevState => ({
                ...prevState,
                abilityScores: {
                    ...prevState.abilityScores,
                    [event.target.name]: selectedValue,
                }
            }));
            setRemainingPoints(remainingPoints - pointsUsed);
        }
    };

    // Get the list of playable races and classes from the server
    useEffect(() => {
        axios.get('/api/races')
            .then((response) => {
                console.log("Races-", response.data)
                const sortedRaces = response.data.sort((a, b) => a.name.localeCompare(b.name));
                setRaces(sortedRaces);
            })
            .catch((error) => {
                console.error(error);
            });
    }, []);

    useEffect(() => {
        axios.get('/api/classes')
            .then((response) => {
                console.log("Classes-", response.data);
                const sortedClasses = response.data.sort((a, b) => a.name.localeCompare(b.name));
                setClasses(sortedClasses);
            })
            .catch((error) => {
                console.error(error);
            });
    }, []);

    useEffect(() => {
        axios.get('/api/backgrounds')
            .then((response) => {
                console.log("Backgrounds-", response.data);
                const sortedBackgrounds = response.data.sort((a, b) => a.name.localeCompare(b.name));
                setBackgrounds(sortedBackgrounds);
            })
            .catch((error) => {
                console.error(error);
            });
    }, []);

    useEffect(() => {
        backgrounds.forEach((background) => {
            // console.log("Background Data-", background.data);
        });
    }, [backgrounds]);

    // Save the completed character
    const handleCreateCharacter = () => {
        // Send the character data to the server
        axios.put('/api/character', { headers, character })
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
        setCharacter({
            ...character,
            [event.target.name]: event.target.value,
        });
    };


    // Buttons for controlling the stepper
    const handleNext = () => {
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
    };

    const handleBack = () => {
        setActiveStep((prevActiveStep) => prevActiveStep - 1);
    };

    const handleStep = (step) => () => {
        setActiveStep(step);
    };

    const handleReset = () => {
        setActiveStep(0);
        setCompleted({});
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
                canComplete = attributes !== '';
                if (canComplete) {
                    updatedCharacter.abilityScores = attributes;
                }
                break;
            case 3: // Character details step
                canComplete = selectedBackground !== '';
                if (canComplete) {
                    updatedCharacter.Background = selectedBackground;
                }
                break;
            case 4: // Equipment step
                canComplete = equipement !== '';
                if (canComplete) {
                    updatedCharacter.Equipment = equipement;
                }
                break;
            default:
                break;
        }

        if (canComplete) {
            setCharacter(updatedCharacter);
            const newCompletedSteps = [...completedSteps];
            newCompletedSteps[activeStep] = true;
            setStepCompleted(newCompletedSteps);
            handleNext();
        } else {
            // Show an error message or some other feedback to the user
            console.error("Please make a selection before proceeding.");
        }
    };


    return (
        <Dialog open={show} maxWidth="md" onClose={handleClose}>
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
                    <div style={{ height: 'calc(100vh - 250px)' }}>
                        <h2>Race</h2>
                        <Form.Group controlId="characterRace">
                            <Form.Select
                                aria-label="Race selection"
                                value={selectedRace}
                                onChange={(e) => { console.log(e.target.value); setSelectedRace(e.target.value) }}
                            >
                                <option>--Choose A Race--</option>
                                {races.map((elem, index) => (
                                    <option key={`race-${index}`} value={elem.name}>{elem.name}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <div style={{ height: '10px' }}></div>
                        {selectedRace && (
                            <div style={{ overflow: 'auto', maxHeight: '63vh' }}>
                                {Object.entries(races.find(race => race.name === selectedRace)?.data || {}).map(([key, value]) => (
                                    <p key={key}>
                                        <strong>{key}:</strong>
                                        {Array.isArray(value) ? value.join(', ') :
                                            (typeof value === 'object' && value !== null) ?
                                                Object.entries(value).map(([subKey, subValue]) => (
                                                    <span key={subKey}>{`${subKey}: ${subValue}`}</span>
                                                )) : value}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {/* Class */}
                {activeStep === 1 && (
                    <div style={{ height: 'calc(100vh - 250px)', overflow: 'auto' }}>
                        <h2>Class</h2>
                        <Form.Group controlId="characterClass" style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
                            <Form>
                                <Form.Group controlId="classSelection">
                                    <Form.Label>Class Selection</Form.Label>
                                    <Form.Select
                                        aria-label="Class selection"
                                        value={selectedClass}
                                        onChange={(e) => { console.log(e.target.value); setSelectedClass(e.target.value) }}
                                    >
                                        <option>--Choose A Class--</option>
                                        {classes.map((elem, index) => (
                                            <option key={`class-${index}`} value={elem.name}>{elem.name}</option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>
                                <div style={{ height: '10px' }}></div>
                                {selectedClass && (
                                    <div style={{ overflow: 'auto', maxHeight: '63vh' }}>
                                        {Object.entries(classes.find(cls => cls.name === selectedClass)?.data || {}).map(([key, value]) => (
                                            <p key={key}>
                                                <strong>{key}:</strong>
                                                {Array.isArray(value) ? value.join(', ') :
                                                    (typeof value === 'object' && value !== null) ?
                                                        Object.entries(value).map(([subKey, subValue]) => (
                                                            <span key={subKey}>{`${subKey}: ${subValue}`}</span>
                                                        )) : value}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </Form>
                        </Form.Group>
                    </div>
                )}
                {/* Attrributes */}
                {activeStep === 2 && (
                    <div style={{ height: 'calc(100vh - 250px)' }}>
                        <h2>Ability Scores</h2>
                        <Form.Group controlId="generationMethod">
                            <Form.Label>Generation Method</Form.Label>
                            <Form.Control as="select" value={method} onChange={handleMethodChange}>
                                <option value="Choose">--Choose a Generation Method--</option>
                                <option value="standard">Standard Array</option>
                                <option value="dice">Dice Roll</option>
                                <option value="point">Point Buy</option>
                            </Form.Control>
                        </Form.Group>
                        {method === 'point' && <p>Remaining Points: {remainingPoints}</p>}
                        {Object.keys(character.abilityScores).map((ability) => (
                            <Form.Group key={ability} controlId={ability}>
                                <Form.Label>{ability}</Form.Label>
                                {method === 'dice' && (
                                    <Form.Control type="number" name={ability} value={character.abilityScores[ability]} onChange={handleAbilityScoreChange} />
                                )}
                                {method === 'point' && (
                                    <Form.Control as="select" name={ability} value={character.abilityScores[ability]} onChange={handlePointBuySelection} >
                                        <option>--Choose--</option>
                                        {Object.keys(pointCosts).map((item) => (
                                            <option key={item} value={item}>{item} (Cost: {pointCosts[item]})</option>
                                        ))}
                                    </Form.Control>
                                )}
                                {method === 'standard' && (
                                    <Form.Control as="select" name={ability} value={character.abilityScores[ability]} onChange={handleStandardArraySelection} >
                                        <option>--Choose--</option>
                                        {standardArray.map((item) => (
                                            <option key={item} value={item}>{item}</option>
                                        ))}
                                    </Form.Control>
                                )}
                            </Form.Group>
                        ))}
                    </div>
                )}
                {/* Description */}
                {activeStep === 3 && (
                    <div style={{ height: 'calc(100vh - 250px)' }}>
                        <Form.Group controlId="characterName">
                            <Form.Label>Name</Form.Label>
                            <Form.Control type="text" name="name" value={character.name} onChange={handleInputChange} required />
                        </Form.Group>
                        <Form.Group controlId="characterBackground">
                            <Form.Label>Background</Form.Label>
                            <Form.Control
                                as="select"
                                name="background"
                                value={selectedBackground.name}
                                onChange={(e) => {
                                    const selected = backgrounds.find(bg => bg.name === e.target.value);
                                    setSelectedBackground(selected);
                                }}
                                required
                            >
                                <option>--Choose--</option>
                                {backgrounds.map((elem, index) => (
                                    <option key={`background-${index}`} value={elem.name}>{elem.name}</option>
                                ))}
                            </Form.Control>
                        </Form.Group>
                        <div style={{ height: '10px' }}></div> {/* This div will create some space */}
                        {selectedBackground && (
                            <div style={{ overflow: 'auto', maxHeight: '50vh' }}>
                                {Object.entries(backgrounds.find(bg => bg.name === selectedBackground.name)?.data || {}).map(([key, value]) => (
                                    <p key={key}>
                                        <strong>{key}:</strong>
                                        {Array.isArray(value) ? value.join(', ') :
                                            (typeof value === 'object' && value !== null) ?
                                                Object.entries(value).map(([subKey, subValue]) => (
                                                    <span key={subKey}>{`${subKey}: ${subValue}`}</span>
                                                )) : value}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {/* Equipment */}
                {activeStep === 4 && (
                    <div style={{ height: 'calc(100vh - 250px)' }}>
                        <h2>Character Equipment</h2>
                        {/* Pick Character Equipment */}
                        {console.log("Selected Background-", selectedBackground)}
                        {selectedBackground && selectedBackground.data && selectedBackground.data.Equipment && (
                            <div>
                                {Object.entries(selectedBackground.data.Equipment).map(([key, value]) => (
                                    <p key={key}>
                                        <strong>{key}:</strong> {value}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {/* Summary */}
                {activeStep === 5 && (
                    <div style={{ height: 'calc(100vh - 250px)' }}>
                        <h2>Character Summary</h2>
                        <div style={{ overflow: 'auto', maxHeight: '63vh' }}>
                            {Object.entries(character).map(([key, value]) => (
                                <p key={key}>
                                    <strong>{key}:</strong>
                                    {Array.isArray(value) ? value.join(', ') :
                                        (typeof value === 'object' && value !== null) ?
                                            Object.entries(value).map(([subKey, subValue]) => (
                                                <span key={subKey}>{`${subKey}: ${subValue}`}</span>
                                            )) : value}
                                </p>
                            ))}
                        </div>
                        {/* Show all character details in a condensed form for verification */}
                    </div>
                )}
            </DialogContent>
            <DialogActions>
                <Stepper activeStep={activeStep} alternativeLabel nonLinear>
                    {steps.map((label, index) => (
                        <Step key={label}>
                            <StepButton onClick={() => setActiveStep(index)} completed={completedSteps[index]}>
                                {label}
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
                            <Box sx={{ flex: '1 1 auto' }} />
                            <Button onClick={handleReset}>Reset</Button>
                        </Box>
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
                            {activeStep !== steps.length &&
                                (completedSteps[activeStep] ? (
                                    <Typography variant="caption" sx={{ display: 'inline-block' }}>
                                        Step {activeStep + 1} already completed
                                    </Typography>
                                ) : (
                                    <Button onClick={handleComplete}>
                                        Complete Step
                                    </Button>
                                ))}
                        </Box>
                    </React.Fragment>
                )}
            </DialogActions>
        </Dialog>
    );
}

export default CreateCharacterModal;
