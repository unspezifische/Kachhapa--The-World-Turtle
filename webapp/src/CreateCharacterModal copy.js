import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal, Button, Form, Pagination, Accordion, Card } from 'react-bootstrap';

const CreateCharacterModal = ({ show, onHide, headers }) => {
    const [step, setStep] = useState(1);
    const [characterSheet, setCharacterSheet] = useState(null);

    // Declare a new state variable to store the character data
    const [character, setCharacter] = useState({name: null});
    const [selectedRace, setSelectedRace] = useState(null);
    const [races, setRaces] = useState([]);
    const [classes, setClasses] = useState([]);

    // Add a new state variable for the selected method
    const [method, setMethod] = useState('Choose');

    // Add a function to handle method changes
    const handleMethodChange = (event) => {
        setMethod(event.target.value);
    };

    // Add new state variables for the ability scores and the standard array
    const [abilityScores, setAbilityScores] = useState({});
    const [standardArray, setStandardArray] = useState([15, 14, 13, 12, 10, 8]);

    // Add a function to handle ability score changes
    const handleAbilityScoreChange = (event) => {
        setAbilityScores({
            ...abilityScores,
            [event.target.name]: event.target.value,
        });
    };

    // Add a function to handle standard array selections
    const handleStandardArraySelection = (event) => {
        const selectedValue = parseInt(event.target.value);
        setAbilityScores({
            ...abilityScores,
            [event.target.name]: selectedValue,
        });
        setStandardArray(standardArray.filter(item => item !== selectedValue));
    };

    const [remainingPoints, setRemainingPoints] = useState(27);
    const pointCosts = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

    // Add a function to handle point buy selections
    const handlePointBuySelection = (event) => {
        const selectedValue = parseInt(event.target.value);
        const previousValue = abilityScores[event.target.name] || 8;
        const pointsUsed = pointCosts[selectedValue] - pointCosts[previousValue];
        if (remainingPoints - pointsUsed >= 0) {
            setAbilityScores({
                ...abilityScores,
                [event.target.name]: selectedValue,
            });
            setRemainingPoints(remainingPoints - pointsUsed);
        }
    };

    // Retreieve the CharacterSheet data from the server
    useEffect(() => {
        axios.get('/api/characterSheet', { headers })
        .then((response) => {
            console.log("CharacterSheet-", response.data[0]);
            setCharacterSheet(response.data[0]);
            // console.log("CharacterSheet Attributes-", response.data[0].attributes);
        })
        .catch((error) => {
            console.error(error);
        });
    }, []);

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

    const handleInputChange = (event) => {
        setCharacter({
            ...character,
            [event.target.name]: event.target.value,
        });
    };

    const handleNext = () => {
        if (step < 3) {
            setStep(step + 1);
        }
    };

    const handlePrevious = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    return (
        <>
            <Modal show={show} onHide={onHide}>
                <Modal.Header closeButton>
                    <Modal.Title>Create New Character</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        {step === 1 && (
                            <>
                                <Form.Group controlId="characterRace">
                                    <Form.Label>Race</Form.Label>
                                    <Accordion>
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
                                <p>Selected Race: {selectedRace}</p>
                                <Form.Group controlId="characterRace">
                                    <Form.Label>Class</Form.Label>
                                    <Accordion>
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
                                {Object.keys(characterSheet.attributes.list).map((score, index) => (
                                    <Form.Group key={index} controlId={`abilityScore${score}`}>
                                        <Form.Label>{score}</Form.Label>
                                        {method === 'dice' && (
                                            <Form.Control type="number" name={score} value={abilityScores[score]} onChange={handleAbilityScoreChange} />
                                        )}
                                        {method === 'point' && (
                                            <Form.Control as="select" name={score} value={abilityScores[score]} onChange={handlePointBuySelection}>
                                                {Object.keys(pointCosts).map((item) => (
                                                    <option key={item} value={item}>{item} (Cost: {pointCosts[item]})</option>
                                                ))}
                                            </Form.Control>
                                        )}
                                        {method === 'standard' && (
                                            <Form.Control as="select" name={score} value={abilityScores[score]} onChange={handleStandardArraySelection}>
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
                                <Form.Group controlId="characterName">
                                    <Form.Label>Name</Form.Label>
                                    <Form.Control type="text" name="name" value={character.name} onChange={handleInputChange} required />
                                </Form.Group>
                                <Form.Group controlId="characterBackground">
                                    <Form.Label>Background</Form.Label>
                                    <Form.Control as="select" name="background" value={character.background} onChange={handleInputChange} required>
                                        <option>Background 1</option>
                                        <option>Background 2</option>
                                        {/* Add more options here as needed */}
                                    </Form.Control>
                                </Form.Group>
                            </>
                        )}
                        {step === 5 && (
                            <>
                                {/* Add fields for step 3 here */}
                            </>
                        )}
                        {step === 6 && (
                            <>
                                {/* Add fields for step 3 here */}
                            </>
                        )}
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Pagination>
                        <Pagination.Prev onClick={handlePrevious} disabled={step === 1} />
                        <Pagination.Item active>{step}</Pagination.Item>
                        <Pagination.Next onClick={handleNext} disabled={step === 3} />
                    </Pagination>
                    <Button variant="secondary" onClick={onHide}>
                        Close
                    </Button>
                    {step === 3 && (
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