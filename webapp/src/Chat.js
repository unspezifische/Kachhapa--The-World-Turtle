import React, { useEffect, useState, useRef } from 'react';
import { Stack, Container, Row, Col, Form, Button, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import axios from 'axios';  // Makes API calls
import "./Chat.css"

import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import RefreshIcon from '@mui/icons-material/Refresh';

function Chat({ headers, socket, characterName, username, campaignID }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const userID = headers.userID;
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [error, setError] = useState('');

  // Add a ref to your message container
  const messageContainerRef = useRef(null);

  let lastGroupId = null;

  useEffect(() => {
    const fetchChatHistory = async () => {
      // Check if characterName has been initialized
      if (characterName) {
        axios.get('/api/chat_history', { headers: headers })
        .then(response => {
          const data = response.data;
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
    const handleMessage = (message) => {
      console.log("Received message:", message);
      if (message.sender === headers.userID || message.recipients.includes(headers.userID)) {
        setUnreadMessages(prevUnreadMessages => prevUnreadMessages + 1);
        setMessages(prevMessages => [...prevMessages, message]);
      } else if (message.type === 'item_transfer' && message.recipients.includes(headers.userID)) {
        setUnreadMessages(prevUnreadMessages => prevUnreadMessages + 1);
        setMessages(prevMessages => [...prevMessages, message]);
      }
    };
  
    const handleActiveUsers = (active_users) => {
      console.log("CHAT- active_users", active_users);
      const otherUsers = active_users.filter(user => user.username !== username);
      setUsers(otherUsers);
    }
  
    socket.on('message', handleMessage);
    socket.on('active_users', handleActiveUsers);
  
    // Emit an event to request the current list of active users
    socket.emit('request_active_users', { campaignID });
  
    return () => {
      socket.off('message', handleMessage);
      socket.off('active_users', handleActiveUsers);
    }
  }, [socket, characterName]);

  const getUsers = () => {
    console.log("Requesting active users...");
    socket.emit('request_active_users', { campaignID });
  }

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
    
    const allUserIDs = message.recipients;
    const filteredUserIDs = allUserIDs.filter(userID => userID !== headers.userID);
    if (message.sender !== headers.userID) {
        filteredUserIDs.push(message.sender);
    }
    setSelectedUsers(filteredUserIDs);
  };

  const renderMessage = (message, i, isSameGroup) => {
    const sender = message.sender_character_name ? message.sender_character_name : message.sender;
    const isCurrentUser = message.sender === headers.userID;
  
    const className = `${isCurrentUser ? "message sent" : "message received"} ${isCurrentUser ? "grouped" : ""} ${isSameGroup ? "" : "new-group"}`;
  
    console.log("Message Type-", message.type);
    return (
      <div
        key={i}
        className={className}
        onClick={() => replyAll(message)}
        ref={i === messages.length - 1 ? messageContainerRef : null}
      >
        <div className="message-text">
          {message.type === 'item_transfer' ? (
            isCurrentUser ? (
              <>
                <p className="sender">
                  From: System
                </p>
                You gave {message.recipient_character_names ? message.recipient_character_names.join(' ') : message.recipients.join(' ')} {message.text}
                <p className="sender">
                {message.sender_character_name ? message.sender_character_name : message.sender}
                </p>
              </>
            ) : (
              <>
                <p className="sender">
                  From: System
                </p>
                {message.sender_character_name ? message.sender_character_name : message.sender} gave you {message.text}
                <p className="sender">
                  {message.recipient_character_names ? message.recipient_character_names.join(' ') : message.recipients.join(' ')}
                </p>
              </>
            )
          ) : (
            <>
              {message.sender === headers.userID ? (
                <>
                  <p className="sender">
                    To: {message.recipient_character_names ? message.recipient_character_names.join(' ') : message.recipients.join(' ')}
                  </p>
                  {message.text}
                  <p className="sender">
                    {message.sender_character_name ? message.sender_character_name : message.sender}
                  </p>
                </>
              ) : (
                <>
                  <p className="sender">
                    From: {message.sender_character_name ? message.sender_character_name : message.sender}
                  </p>
                  {message.text}
                  <p className="sender">
                    {message.recipient_character_names ? message.recipient_character_names.join(' ') : message.recipients.join(' ')}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // Scrolls to the bottom when a new message is received.
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
            <Button variant='outline-primary' onClick={() => getUsers()}>
              <RefreshIcon />
            </Button>
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
