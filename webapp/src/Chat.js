import React, { useEffect, useState, useRef } from 'react';
import { Stack, Container, Row, Col, Form, Button, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import axios from 'axios';  // Makes API calls
import "./Chat.css"

import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';

import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';


function Chat({ headers, socket, characterName, username, campaignID, users, messages, setMessages, requestActiveUsers }) {
  const [message, setMessage] = useState(''); 
  const [selectedUsers, setSelectedUsers] = useState([]);
  const userID = headers.userID;
  const [error, setError] = useState('');

  // Add a ref to your message container
  const messageContainerRef = useRef(null);

  let lastGroupId = null;

  useEffect(() => {
    const fetchChatHistory = async () => {
      if (!characterName) return;

      try {
        const response = await axios.get('/api/chat_history', { headers });
        const formattedMessages = response.data.map((message) => ({
          ...message,
          item: message.item || null
        }));
        setMessages(formattedMessages);
      } catch (error) {
        console.error("CHAT- Error fetching chat history:", error);
      }
    };

    fetchChatHistory();
  }, [characterName, headers, setMessages]);

  const getDisplayName = (message) => {
    return message.sender_character_name || String(message.sender || '');
  };

  const getInitials = (name) => {
    if (!name) return '?';

    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }

    return parts[0].slice(0, 2).toUpperCase();
  };

  const sendMessage = (event, item = null) => {
    event.preventDefault();

    if (!socket) {
      setError('Socket not connected.');
      return;
    }

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
    console.log("CHAT- Selected users:", selected);
    setSelectedUsers(selected);
  };

  const replyAll = (message) => {
    console.log("CHAT- Replying to message:", message);
    
    const allUserIDs = message.recipients;
    const filteredUserIDs = allUserIDs.filter(userID => userID !== headers.userID);
    if (message.sender !== headers.userID) {
        filteredUserIDs.push(message.sender);
    }
    setSelectedUsers(filteredUserIDs);
  };

  const renderMessage = (message, i, isSameGroup) => {
    const senderName = getDisplayName(message);
    const initials = getInitials(senderName);
    const isCurrentUser = message.sender === headers.userID;

    const recipientNames = message.recipient_character_names
      ? message.recipient_character_names
      : (message.recipients || []).join(', ');

    const className = `${isCurrentUser ? "message sent" : "message received"} ${isSameGroup ? "message-grouped" : "new-group"}`;

    return (
      <div
        key={i}
        className={className}
        onClick={() => replyAll(message)}
        ref={i === messages.length - 1 ? messageContainerRef : null}
      >
        {!isCurrentUser && (
          <div className="message-avatar-wrap">
            <Tooltip title={senderName} arrow placement="top">
              <Avatar className="message-avatar">
                {initials}
              </Avatar>
            </Tooltip>
          </div>
        )}

        <div className="message-bubble">
          <div className="message-text">
            {message.text}
          </div>

          <div className="message-recipient-avatars">
            {(message.recipient_character_names || [])
              .filter((name) => name && name !== senderName)
              .map((name, idx) => (
                <Tooltip key={`${name}-${idx}`} title={name} arrow placement="top">
                  <Avatar className="message-recipient-avatar">
                    {getInitials(name)}
                  </Avatar>
                </Tooltip>
              ))}
          </div>
        </div>

        {isCurrentUser && (
          <div className="message-avatar-wrap">
            <Tooltip title={characterName || username || 'Me'} arrow placement="top">
              <Avatar className="message-avatar message-avatar-self">
                {getInitials(characterName || username || 'Me')}
              </Avatar>
            </Tooltip>
          </div>
        )}
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
    <div className="chat-widget">
      <Stack className="h-100">
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
            <Button variant='outline-primary' onClick={requestActiveUsers}>
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
    </div>
  );
}

export default Chat;
