import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Stack, Container, Row, Col, Form, Button } from 'react-bootstrap';
import axios from 'axios';  // Makes API calls
import "./Chat.css"

import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';

import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import AvatarGroup from '@mui/material/AvatarGroup';
import IconButton from '@mui/material/IconButton';
import ClearAllIcon from '@mui/icons-material/ClearAll';


function Chat({ headers, socket, characterName, username, campaignID, users, messages, setMessages, requestActiveUsers }) {
  const [message, setMessage] = useState(''); 
  const [selectedUsers, setSelectedUsers] = useState([]);
  const userID = headers.userID;
  const [error, setError] = useState('');

  const messageContainerRef = useRef(null);

  const DEFAULT_AVATAR = {
    mode: 'initials',
    initials: '?',
    color: '#64748b',
    text_color: '#f8fafc',
    image_url: null,
    preset_key: null,
    shape: 'circle',
    frame_color: null,
  };

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

  const activeGroupId = useMemo(() => {
    if (!selectedUsers.length) return null;

    return [headers.userID, ...selectedUsers]
      .map((id) => Number(id))
      .sort((a, b) => a - b)
      .join("-");
  }, [headers.userID, selectedUsers]);

  const normalizeAvatar = (avatar, fallbackName, fallbackColor = null) => {
    const initials = avatar?.initials || getInitials(fallbackName);

    return {
      ...DEFAULT_AVATAR,
      ...(avatar || {}),
      initials,
      color: avatar?.color || fallbackColor || DEFAULT_AVATAR.color,
      text_color: avatar?.text_color || DEFAULT_AVATAR.text_color,
    };
  };

  const getAvatarStyle = (avatar) => ({
    backgroundColor: avatar?.color || DEFAULT_AVATAR.color,
    color: avatar?.text_color || DEFAULT_AVATAR.text_color,
    borderColor: avatar?.frame_color || undefined,
  });

  const renderAvatar = (avatar, label, className) => {
    const normalized = normalizeAvatar(avatar, label);

    if (normalized.mode === 'image' && normalized.image_url) {
      return (
        <Tooltip title={label} arrow placement="top">
          <Avatar
            className={className}
            src={normalized.image_url}
            sx={getAvatarStyle(normalized)}
          >
            {normalized.initials}
          </Avatar>
        </Tooltip>
      );
    }

    return (
      <Tooltip title={label} arrow placement="top">
        <Avatar
          className={className}
          sx={getAvatarStyle(normalized)}
        >
          {normalized.initials}
        </Avatar>
      </Tooltip>
    );
  };

  const buildParticipantAvatars = (message, senderAvatar, selfAvatar) => {
    const senderName = getDisplayName(message);
    const isCurrentUser = message.sender === headers.userID;

    const participants = [];

    // Always show the sender first
    participants.push({
      key: `sender-${message.sender}`,
      name: senderName,
      avatar: isCurrentUser ? selfAvatar : senderAvatar,
    });

    // Then show recipients
    const recipientNames = message.recipient_character_names || [];
    recipientNames.forEach((name, idx) => {
      const isMe = name === (characterName || username || 'Me');

      participants.push({
        key: `recipient-${idx}-${name}`,
        name,
        avatar: normalizeAvatar(
          null,
          name,
          isMe ? '#7c3aed' : '#64748b'
        ),
      });
    });

    // Deduplicate by name so sender doesn't appear twice in simple 1-to-1 cases
    const seen = new Set();
    return participants.filter((participant) => {
      const key = participant.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
      setSelectedUsers([]);   // Clear selected users. Consider keeping them selected for convenience in future messages if desired.
    }
    setMessage('');
    setError(''); // Clear error after sending message
  };

  const toggleSelectedUser = (targetUserId) => {
    setSelectedUsers((prev) => {
      if (prev.includes(targetUserId)) {
        return prev.filter((id) => id !== targetUserId);
      }
      return [...prev, targetUserId];
    });
  };

  const clearSelectedUsers = () => {
    setSelectedUsers([]);
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

  const getMessageClusterMeta = (messages, index) => {
    const current = messages[index];
    const previous = index > 0 ? messages[index - 1] : null;
    const next = index < messages.length - 1 ? messages[index + 1] : null;

    const currentIsSent = current.sender === headers.userID;
    const previousIsSent = previous ? previous.sender === headers.userID : null;
    const nextIsSent = next ? next.sender === headers.userID : null;

    const sameAsPrevious =
      !!previous &&
      previous.group_id === current.group_id &&
      previousIsSent === currentIsSent;

    const sameAsNext =
      !!next &&
      next.group_id === current.group_id &&
      nextIsSent === currentIsSent;

    return {
      sameAsPrevious,
      sameAsNext,
      clusterPosition: sameAsPrevious && sameAsNext
        ? 'middle'
        : sameAsPrevious
          ? 'bottom'
          : sameAsNext
            ? 'top'
            : 'single',
    };
  };

  const renderMessage = (message, i, clusterMeta) => {
    const senderName = getDisplayName(message);
    const isCurrentUser = message.sender === headers.userID;

    const senderAvatar = normalizeAvatar(
      message.sender_avatar,
      senderName,
      isCurrentUser ? '#7c3aed' : '#64748b'
    );

    const selfAvatar = normalizeAvatar(
      message.self_avatar,
      characterName || username || 'Me',
      '#7c3aed'
    );

    const isActiveThread = !activeGroupId || message.group_id === activeGroupId;

    const className = [
      "message",
      isCurrentUser ? "sent" : "received",
      `message-cluster-${clusterMeta.clusterPosition}`,
      clusterMeta.sameAsPrevious ? "message-same-prev" : "message-new-run",
      isActiveThread ? "message-thread-active" : "message-thread-dimmed",
    ].join(" ");

    const participantAvatars = buildParticipantAvatars(message, senderAvatar, selfAvatar);

    return (
      <div
        key={i}
        className={className}
        onClick={() => replyAll(message)}
        ref={i === messages.length - 1 ? messageContainerRef : null}
      >
        {!isCurrentUser && (
          <div className="message-avatar-wrap">
            {renderAvatar(senderAvatar, senderName, 'message-avatar')}
          </div>
        )}

        <div className="message-bubble">
          <div className="message-text">
            {message.text}
          </div>

          {(clusterMeta.clusterPosition === 'single' || clusterMeta.clusterPosition === 'bottom') && (
            <div className="message-recipient-avatars">
              <AvatarGroup
                max={participantAvatars.length}
                spacing="small"
                className="message-avatar-group"
              >
                {participantAvatars.map((participant) => (
                  <div key={participant.key}>
                    {renderAvatar(
                      participant.avatar,
                      participant.name,
                      'message-recipient-avatar'
                    )}
                  </div>
                ))}
              </AvatarGroup>
            </div>
          )}
        </div>

        {isCurrentUser && (
          <div className="message-avatar-wrap">
            {renderAvatar(selfAvatar, characterName || username || 'Me', 'message-avatar message-avatar-self')}
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
          {/* Displays previous messages */}
        <Row className="chat-feed-row">
          <Col ref={messageContainerRef} className="chat-feed-col messageContainer">
            {messages.map((message, i) => {
              const clusterMeta = getMessageClusterMeta(messages, i);
              return renderMessage(message, i, clusterMeta);
            })}
          </Col>
        </Row>
          
          {/* Display active users */}
        <Row className="recipient-picker-row">
          <Col className="recipient-picker-col">
            <div className="recipient-picker-bar">
              <div className="recipient-chip-list">
                {users.length === 0 ? (
                  <div className="recipient-empty-state">Nobody else here!</div>
                ) : (
                  users.map((user) => {
                    const isSelected = selectedUsers.includes(user.userID);
                    const avatar = normalizeAvatar(user.avatar, user.character_name || user.username);

                    return (
                      <Chip
                        clickable
                        onClick={() => toggleSelectedUser(user.userID)}
                        avatar={
                          <Avatar
                            className="recipient-chip-avatar"
                            style={{
                              backgroundColor: avatar.color || DEFAULT_AVATAR.color,
                              color: avatar.text_color || DEFAULT_AVATAR.text_color,
                              border: '1px solid rgba(255,255,255,0.12)',
                            }}
                            sx={{
                              fontWeight: 800,
                              fontSize: '0.76rem',
                            }}
                          >
                            {avatar.initials}
                          </Avatar>
                        }
                        label={user.character_name === "DM" ? `${user.character_name} - ${user.username}` : user.character_name}
                        className={`recipient-chip ${isSelected ? 'is-selected' : 'is-unselected'}`}
                      />
                    );
                  })
                )}
              </div>

              <div className="recipient-picker-actions">
                <Tooltip title="Clear recipients" arrow placement="top">
                  <span>
                    <IconButton
                      onClick={clearSelectedUsers}
                      disabled={selectedUsers.length === 0}
                      className="recipient-clear-btn"
                      size="small"
                    >
                      <ClearAllIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
            </div>
          </Col>
        </Row>

          {/* Text Field for composing messages */}
        <Row className="chat-compose-row">
          <Col className="chat-compose-col">
            <Form onSubmit={sendMessage} className="chat-compose-form">
              <Form.Group>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyPress={(event) => (event.key === 'Enter' ? sendMessage(event) : null)}
                />
              </Form.Group>

              <p className="error-message">{error}</p>

              <div className="chat-compose-actions">
                <Button variant="primary" type="submit">
                  <SendIcon fontSize="medium" />
                </Button>
              </div>
            </Form>
          </Col>
        </Row>
        </Stack>
    </div>
  );
}

export default Chat;
