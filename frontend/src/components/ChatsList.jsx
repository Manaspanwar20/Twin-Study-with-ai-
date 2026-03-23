import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import socket from '../socket';

const ChatsList = () => {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    socket.emit("get_chats", {}, (response) => {
      if (response) {
        setChats(response);
      }
    });
  }, []);

  return (
    <div className="chats-container">
      <h1 className="hero-title" style={{ fontSize: '3rem', textAlign: 'left', marginBottom: '30px' }}>Your Chats</h1>
      <div className="chat-list">
        {chats.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No chats yet. Start one from the home screen!</p>
        ) : (
          chats.map(chat => (
            <Link to={`/chat/${chat.id}`} key={chat.id} className="chat-list-item">
              <div>
                <strong style={{ display: 'block', fontSize: '1.2rem', marginBottom: '8px', textTransform: 'capitalize' }}>
                  {chat.title && chat.title !== "New Chat" ? chat.title : `Chat from ${new Date(chat.createdAt).toLocaleDateString()}`}
                </strong>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {chat.messages && chat.messages.length > 0 
                     ? chat.messages[0].text.substring(0, 50) + '...'
                     : 'New Chat'}
                </span>
              </div>
              <div style={{ color: 'var(--accent-color)' }}>➔</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default ChatsList;
