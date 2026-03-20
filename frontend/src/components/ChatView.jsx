import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import AuthModal from './AuthModal';

const ChatView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chat, setChat] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Fetch initial chat data
    socket.emit("get_chat", id, (response) => {
      if (response) {
        setChat(response);
      }
    });

    // Join room
    socket.emit("join_chat", id);

    // Listen for new messages
    const handleMessage = (msg) => {
      setChat(prev => {
        if (!prev) return prev;
        // Avoid duplicate messages if already re-fetched
        if (prev.messages.find(m => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    };

    socket.on("receive_message", handleMessage);

    return () => {
      socket.off("receive_message", handleMessage);
    };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  const handleSend = () => {
    if (!localStorage.getItem('token')) {
      setAuthModalMessage("Please login or register first to chat.");
      setAuthModalOpen(true);
      return;
    }
    if (!inputValue.trim()) return;
    socket.emit("send_message", { chatId: id, message: inputValue });
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleUploadClick = () => {
    if (!localStorage.getItem('token')) {
      setAuthModalMessage("Please login or register first to upload files.");
      setAuthModalOpen(true);
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      console.log('Files selected in chat:', files);
      
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append("files", file);
      });
      formData.append("chatId", id);

      try {
        const response = await fetch("http://localhost:3000/api/upload", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: formData,
        });

        const data = await response.json();
        
        if (data.success) {
           console.log("Uploaded successfully:", data.files);
        } else {
           console.error("Upload failed");
           alert("Upload failed.");
        }
      } catch (err) {
        console.error("Error uploading files:", err);
        alert("Error uploading files.");
      }
      
      // clear the input so the same file can be uploaded again if needed
      fileInputRef.current.value = "";
    }
  };

  if (!chat) return <div className="chat-view-container"><p>Loading...</p></div>;

  return (
    <div className="chat-view-container" style={{ position: 'relative' }}>
      <div className="chat-messages">
        {chat.messages.map(msg => (
          <div key={msg.id} className={`message ${msg.sender === 'user' ? 'user' : 'ai'}`}>
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-wrapper">
        <div className="chat-input-inner">
          <div className="study-input-container">
            <input 
              type="text" 
              className="study-input" 
              placeholder="Reply to Twin ai..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button className="submit-arrow-button" onClick={handleSend} title="Send Message">
              ➔
            </button>
            <button className="plus-button" onClick={handleUploadClick} title="Upload files">+</button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
              multiple
            />
          </div>
        </div>
      </div>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} message={authModalMessage} />
    </div>
  );
};

export default ChatView;
