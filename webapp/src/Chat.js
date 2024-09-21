import React, { useEffect, useState } from 'react';
import { Stack, Container, Row, Col, Form, Button, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import axios from 'axios';  // Makes API calls
import "./Chat.css"

import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';

function Chat({ headers, socket, characterName, username, campaignID }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const userID = headers.userID;
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [error, setError] = useState('');

  // Add a ref to your message container
  const messageContainerRef = React.useRef(null);

  let lastGroupId = null;

  useEffect(() => {
    const fetchChatHistory = async () => {
      // Check if characterName has been initialized
      if (characterName) {
        console.log("CHAT- Getting message history for " + characterName);
        axios.get('/api/chat_history', { headers: headers })
        .then(response => {
          const data = response.data;
          // console.log("CHAT HISTORY- response:", data)
  
          // Ensure each message has an item property, even if it's null
          const formattedMessages = data.map(message => ({
            ...message,
            item: message.item || null
          }));
  
          setMessages(formattedMessages);
        })
        .catch(error => {
          console.error("CHAT- Error fetching chat history:", error);
        })
      }
    };
  
    // Fetch chat history when the component mounts
    fetchChatHistory();
  }, [characterName]);


  useEffect(() => {
    console.log("CHAT- users:", users);
    console.log("CHAT- campaignID", campaignID)
  }, [users, campaignID]);

  useEffect(() => {
    const handleMessage = (message) => {
      console.log("Receivied message:", message);
      console.log("Checking message from: " + message.sender_character_name);
      console.log("Checking message to: " + message.recipient_character_names);
      if (message.sender === headers.userID || message.recipients.includes(headers.userID)) {
        console.log("It's a match")
        setUnreadMessages(prevUnreadMessages => prevUnreadMessages + 1);
        setMessages(prevMessages => [...prevMessages, message]);
      } else if (message.type === 'item_transfer' && message.recipients.includes(headers.userID)) {
        setUnreadMessages(prevUnreadMessages => prevUnreadMessages + 1);
        setMessages(prevMessages => [...prevMessages, message]);
      }
    };
  
    const handleActiveUsers = (active_users) => {
      console.log("CHAT- active_users", active_users);
      // console.log("CHAT- your characterName:", characterName);
      const otherUsers = active_users.filter(user => user.username !== username);
      setUsers(otherUsers);
    }
  
    socket.on('message', handleMessage);
    socket.on('active_users', handleActiveUsers);
  
    // Emit an event to request the current list of active users
    socket.emit('request_active_users', { campaignID: campaignID });
  
    return () => {
      socket.off('message', handleMessage);
      socket.off('active_users', handleActiveUsers);
    }
  }, [socket, characterName]);

  const sendMessage = (event, item = null) => {
    event.preventDefault();

    if (selectedUsers.length === 0) {
      setError('No recipients selected.');
      return;
    }

    if (message) {
      const messageObj = {
        type: item ? 'item_transfer' : 'text_message',
        sender: headers.userID,
        campaignID: campaignID,
        text: message,
        recipients: selectedUsers,
        item: item,
        group_id: [headers.userID, ...selectedUsers].sort().join("-")
      };

      socket.emit('sendMessage', messageObj, () => setMessage(''));
      setSelectedUsers([]);   // Clear selected users
    }
    setMessage('');
    setError(''); // Clear error after sending message
  };

  const handleChange = (selected) => {
    console.log("Selected users:", selected);
    setSelectedUsers(selected);
  };

  const replyAll = (message) => {
    console.log("Replying to message:", message);
    
    // Extract userID values from recipients
    const allUserIDs = message.recipients;
    console.log("SELECTED MESSAGE- All user IDs:", allUserIDs);

    // Get userID from headers
    console.log("SELECTED MESSAGE- Your userID:", headers.userID);
    
    // Filter out the current user's userID from recipients
    const filteredUserIDs = allUserIDs.filter(userID => userID !== headers.userID);
    console.log("SELECTED MESSAGE- Filtered user IDs:", filteredUserIDs);
    
    // Check if the sender's userID does not match the current user's userID
    if (message.sender !== headers.userID) {
        filteredUserIDs.push(message.sender);
    }
    console.log("SELECTED MESSAGE- Final user IDs:", filteredUserIDs);
    
    // Update the selectedUsers state with filtered user IDs
    setSelectedUsers(filteredUserIDs);
  };

  const renderMessage = (message, i, isSameGroup) => (
    <div
      key={i}
      className={`${(message.sender_character_name ? message.sender_character_name : message.sender) === characterName ? "message sent" : "message received"} ${(message.sender_character_name ? message.sender_character_name : message.sender) === characterName ? "grouped" : ""} ${isSameGroup ? "" : "new-group"}`}
      onClick={() => replyAll(message)}
      ref={i === messages.length - 1 ? messageContainerRef : null}
    >
      <div className="message-text">
        {message.sender === headers.userID ? (
          <>
            {message.type !== 'item_transfer' && (
              <p className="sender">
                To: {message.recipient_character_names ? message.recipient_character_names.join(' ') : message.recipients.join(' ')}
              </p>
            )}
            {message.type === 'item_transfer' 
              ? `${message.sender_character_name ? message.sender_character_name : message.sender} gave you ${message.item.quantity} ${message.item.name}` 
              : message.text}
            {message.type !== 'item_transfer' && (
              <p className="sender">
                {message.sender_character_name ? message.sender_character_name : message.sender}
              </p>
            )}
          </>
          ) : (
          <>
            <p className="sender">
              From: {message.sender_character_name ? message.sender_character_name : message.sender}
            </p>
            {message.type === 'item_transfer' 
              ? `${message.sender_character_name ? message.sender_character_name : message.sender} gave you ${message.item.quantity} ${message.item.name}` 
              : message.text}
            {message.type !== 'item_transfer' && (
              <p className="sender">
                {message.recipient_character_names ? message.recipient_character_names.join(' ') : message.recipients.join(' ')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Scrolls to the bottom when a new message is recieved.
  useEffect(() => {
    if (messageContainerRef.current) {
      const scrollElement = messageContainerRef.current;
      setTimeout(() => {
        scrollElement.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages]);

  return (
    <>
      {/* Show the Chat Widget */}
        <Stack>
          <Row>
            <Col>
              <h1>Chat</h1>
            </Col>
          </Row>
          
          {/* Displays previous messages */}
          <Row>
            <Col ref={messageContainerRef} className="messageContainer">
              {messages.slice().map((message, i) => {
                const isSameGroup = lastGroupId === message.group_id;
                lastGroupId = message.group_id;  // update the last group ID
                return renderMessage(message, i, isSameGroup);
              })}
            </Col>
          </Row>
          
          {/* Display active users */}
          <Row>
            <Col>
              <ToggleButtonGroup
                type="checkbox"
                value={selectedUsers}
                onChange={handleChange}
                vertical
              >
                {users.length === 0 ? (
                  <ToggleButton
                    id="no-users"
                    value="no-users"
                    variant="outline-primary"
                    disabled
                  >
                    Nobody else here!
                  </ToggleButton>
                ) : (
                  users.map((user, i) => (
                    <ToggleButton
                      id={user.userID }
                      value={user.userID}
                      key={i}
                      variant="outline-primary"
                    >
                      {user.character_name === "DM" ? `${user.character_name}- ${user.username}` : user.character_name}
                    </ToggleButton>
                  ))
                )}
              </ToggleButtonGroup>
            </Col>
          </Row>
          {/* Text Field for composing messages */}
          <Row>
            <Col>
              <Form onSubmit={sendMessage}>
                <Form.Group>
                  <Form.Control
                    as="textarea"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyPress={(event) => (event.key === 'Enter' ? sendMessage(event) : null)}
                  />
                </Form.Group>
                <p className="error-message">{error}</p>
                <Button variant="primary" type="submit">
                  <SendIcon fontSize="medium" />
                </Button>
              </Form>
            </Col>
          </Row>
        </Stack>
    </>
  );
}

export default Chat;
