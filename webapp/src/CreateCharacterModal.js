import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal, Button, Form, Pagination, Accordion, Card } from 'react-bootstrap';

const CreateCharacterModal = ({ show, onHide, headers }) => {
    const [step, setStep] = useState(1);

    // Declare a new state variable to store the character data
    const [character, setCharacter] = useState({
        Name: null,
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

    const [selectedRace, setSelectedRace] = useState(null);
    const [races, setRaces] = useState([]);
    const [classes, setClasses] = useState([]);

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

    // For debugging purposes, log the character data whenever it changes
    useEffect(() => {
        console.log('Character updated:', character);
    }, [character]);

    // Get the list of playable races and classes from the server
    useEffect(() => {
        axios.get('http://127.0.0.1:5001/api/races')
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
        axios.get('http://127.0.0.1:5001/api/classes')
            .then((response) => {
                console.log("Classes-", response.data);
                const sortedClasses = response.data.sort((a, b) => a.name.localeCompare(b.name));
                setClasses(sortedClasses);
            })
            .catch((error) => {
                console.error(error);
            });
    }, []);

    // Save the completed character
    const handleCreateCharacter = () => {
        // Send the character data to the server
        axios.put('http://127.0.0.1:5001/api/character', { headers, character })
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

    // Progress to the next step of the creation process
    const handleNext = () => {
        if (step < 7) {
            setStep(step + 1);
        }
    };

    // Return to the previous step of the creation process
    const handlePrevious = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    return (
        <>
            <Modal show={show} onHide={onHide} style={{ maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'auto'}}>
                <Modal.Header closeButton>
                    <Modal.Title>Create New Character</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        {step === 1 && (
                            <>
                                <h2>Race</h2>
                                <Form.Group controlId="characterRace">
                                    <Form.Label>Race</Form.Label>
                                    <Accordion style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
                                        {races.map((elem, index) => (
                                            <Accordion.Item eventKey={index.toString()} key={`race-${index}`} >
                                                <Accordion.Header onClick={() => setSelectedRace(elem.name)}>{elem.name}</Accordion.Header>
                                                <Accordion.Body>
                                                    {Object.entries(elem.data).map(([key, value]) => (
                                                        <p key={key}>
                                                            <strong>{key}:</strong>
                                                            {Array.isArray(value) ? value.join(', ') :
                                                                (typeof value === 'object' && value !== null) ?
                                                                    Object.entries(value).map(([subKey, subValue]) => (
                                                                        <span key={subKey}>{`${subKey}: ${subValue}`}</span>
                                                                    )) : value}
                                                        </p>
                                                    ))}
                                                </Accordion.Body>
                                            </Accordion.Item>
                                        ))}
                                    </Accordion>
                                </Form.Group>
                            </>
                        )}
                        {step === 2 && (
                            <>
                                <h2>Selected Race: {selectedRace}</h2>
                                <Form.Group controlId="characterRace">
                                    <Form.Label>Class</Form.Label>
                                    <Accordion style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
                                        {classes.map((elem, index) => (
                                            <Accordion.Item eventKey={index.toString()} key={`class-${index}`}>
                                                <Accordion.Header>{elem.name}</Accordion.Header>
                                                <Accordion.Body>
                                                    {Object.entries(elem.data).map(([key, value]) => (
                                                        <p key={key}>
                                                            <strong>{key}:</strong>
                                                            {Array.isArray(value) ? value.join(', ') :
                                                                (typeof value === 'object' && value !== null) ?
                                                                    Object.entries(value).map(([subKey, subValue]) => (
                                                                        <span key={subKey}>{`${subKey}: ${subValue}`}</span>
                                                                    )) : value}
                                                        </p>
                                                    ))}
                                                </Accordion.Body>
                                            </Accordion.Item>
                                        ))}
                                    </Accordion>
                                </Form.Group>
                            </>
                        )}
                        {step === 3 && (
                            <>
                                <h2>Ability Scores</h2>
                                <Form.Group controlId="generationMethod">
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
                            </>
                        )}
                        {step === 4 && (
                            <>
                                <h2>Character Details</h2>
                                <Form.Group controlId="characterName">
                                    <Form.Label>Name</Form.Label>
                                    <Form.Control type="text" name="name" value={character.name} onChange={handleInputChange} required />
                                </Form.Group>
                                <Form.Group controlId="characterBackground">
                                    <Form.Label>Background</Form.Label>
                                    <Form.Control as="select" name="background" value={character.background} onChange={handleInputChange} required>
                                        <option>--Choose--</option>
                                        <option>Acolyte</option>
                                        <option>Charlatan</option>
                                        <option>City Watch</option>
                                        <option>Clan Crafter</option>
                                        <option>Cloistered Scholar</option>
                                        <option>Courtier</option>
                                        <option>Criminal</option>
                                        <option>Entertainer</option>
                                        <option>Faction Agent</option>
                                        <option>Far Traveler</option>
                                        <option>Folk Hero</option>
                                        <option>Guild Artisan</option>
                                        <option>Hermit</option>
                                        <option>Inheritor</option>
                                        <option>Knight of the Order</option>
                                        <option>Mercenary Veteran</option>
                                        <option>Noble</option>
                                        <option>Outlander</option>
                                        <option>Sage</option>
                                        <option>Sailor</option>
                                        <option>Soldier</option>
                                        <option>Urchin</option>
                                        <option>Urban Bounty Hunter</option>
                                        <option>Uthgardt Tribe Member</option>
                                    </Form.Control>
                                </Form.Group>
                            </>
                        )}
                        {step === 5 && (
                            <>
                                {/* Pick Character Equipment */}
                            </>
                        )}
                        {step === 6 && (
                            <>
                                {/* Show all character details in a condensed form for verification */}
                            </>
                        )}
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Pagination>
                        <Pagination.Prev onClick={handlePrevious} disabled={step === 1} />
                        <Pagination.Item active>{step}</Pagination.Item>
                        <Pagination.Next onClick={handleNext} disabled={step === 6} />
                    </Pagination>
                    <Button variant="secondary" onClick={onHide}>
                        Close
                    </Button>
                    {step === 6 && (
                        <Button variant="primary" onClick={handleCreateCharacter}>
                            Create Character
                        </Button>
                    )}
                </Modal.Footer>
            </Modal>
        </>
    );
}

export default CreateCharacterModal;