import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import AuthModal from './AuthModal';
import ReactMarkdown from 'react-markdown';
import SyllabusTracker from './SyllabusTracker';
import QuizCard from './QuizCard';

const ChatView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chat, setChat] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const syllabusInputRef = useRef(null);

  const [pendingFiles, setPendingFiles] = useState([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef(null);

  // Syllabus tracker state
  const [syllabus, setSyllabus] = useState(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [showSyllabus, setShowSyllabus] = useState(false);

  // Close plus menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    // 1. Reset states when ID changes to ensure clean load
    setChat(null);
    setSyllabus(null);
    setShowSyllabus(false);
    setPendingFiles([]);

    const handleConnect = () => {
      console.log('Socket reconnected, joining chat:', id);
      socket.emit("join_chat", id);
    };

    socket.emit("get_chat", id, (response) => {
      if (response) {
        setChat(response);
        // 2. Priority 1: Restore from server-side stored syllabus
        if (response.syllabus) {
          console.log("Restoring syllabus from server for chat:", id);
          setSyllabus(response.syllabus);
          setShowSyllabus(true);
        } else {
          // 3. Priority 2: Fallback to session cache (useful right after upload)
          const cached = sessionStorage.getItem(`syllabus_${id}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              console.log("Restoring syllabus from cache for chat:", id);
              setSyllabus(parsed);
              setShowSyllabus(true);
              // don't remove immediately in case of refresh
            } catch (e) {
              console.error("Cache parse error:", e);
            }
          }
        }
      }
    });
    socket.emit("join_chat", id);
    socket.on('connect', handleConnect);

    const handleMessage = (msg) => {
      setChat(prev => {
        if (!prev) return prev;
        if (prev.messages.find(m => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    };

    const handleMessageUpdate = (updatedMsg) => {
      setChat(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)
        };
      });
    };

    const handleSyllabusReady = (data) => {
      setSyllabusLoading(false);
      if (data && data.syllabus) {
        setSyllabus(data.syllabus);
        setShowSyllabus(true);
      }
    };

    socket.on("receive_message", handleMessage);
    socket.on("receive_message_update", handleMessageUpdate);
    socket.on("syllabus_ready", handleSyllabusReady);

    return () => {
      socket.off('connect', handleConnect);
      socket.off("receive_message", handleMessage);
      socket.off("receive_message_update", handleMessageUpdate);
      socket.off("syllabus_ready", handleSyllabusReady);
    };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  // Smart topic detection: when AI responds, auto-check topics mentioned as done
  useEffect(() => {
    if (!syllabus || !chat?.messages?.length) return;
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (!lastMsg || lastMsg.sender !== 'ai' || !lastMsg.text) return;
    
    const lower = lastMsg.text.toLowerCase();
    const markPhrases = ['completed', 'done', 'finished', 'understood', 'mastered', 'covered', 'learned'];
    const hasMark = markPhrases.some(p => lower.includes(p));
    if (!hasMark) return;

    let changed = false;
    const updatedUnits = syllabus.units.map(unit => {
      let unitChanged = false;
      const updatedTopics = unit.topics.map(topic => {
        if (topic.done) return topic;
        const topicLower = topic.name.toLowerCase();
        if (lower.includes(topicLower)) {
          changed = true;
          unitChanged = true;
          return { ...topic, done: true };
        }
        return topic;
      });
      return unitChanged ? { ...unit, topics: updatedTopics } : unit;
    });

    if (changed) {
      const updatedSyllabus = { ...syllabus, units: updatedUnits };
      setSyllabus(updatedSyllabus);
      socket.emit("update_syllabus", { chatId: id, syllabus: updatedSyllabus });
    }
  }, [chat?.messages?.length]); // Only run when messages length changes

  const handleSend = () => {
    if (!localStorage.getItem('token')) {
      setAuthModalMessage("Please login or register first to chat.");
      setAuthModalOpen(true);
      return;
    }
    if (!inputValue.trim() && pendingFiles.length === 0) return;
    socket.emit("send_message", {
      chatId: id,
      message: inputValue,
      files: pendingFiles
    });
    setInputValue('');
    setPendingFiles([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  const handleUploadClick = () => {
    if (!localStorage.getItem('token')) {
      setAuthModalMessage("Please login or register first to upload files.");
      setAuthModalOpen(true);
      return;
    }
    setPlusMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleSyllabusUploadClick = () => {
    if (!localStorage.getItem('token')) {
      setAuthModalMessage("Please login or register first to upload your syllabus.");
      setAuthModalOpen(true);
      return;
    }
    setPlusMenuOpen(false);
    if (syllabusInputRef.current) syllabusInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      console.log('Files selected in chat:', files);

      const formData = new FormData();
      Array.from(files).forEach(file => { formData.append("files", file); });
      formData.append("chatId", id);

      try {
        const response = await fetch("http://localhost:3000/api/upload", {
          method: "POST",
          headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
          body: formData,
        });
        const data = await response.json();
        if (data.success) {
          setPendingFiles(prev => [...prev, ...data.files]);
        } else {
          alert("Upload failed.");
        }
      } catch (err) {
        console.error("Error uploading files:", err);
        alert("Error uploading files.");
      }
      fileInputRef.current.value = "";
    }
  };

  const handleSyllabusFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setSyllabusLoading(true);
    setShowSyllabus(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("chatId", id);

    try {
      const response = await fetch("http://localhost:3000/api/upload-syllabus", {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.syllabus) {
        setSyllabus(data.syllabus);
        setSyllabusLoading(false);
      } else {
        alert("Could not parse syllabus. Please try a clear PDF or text file.");
        setSyllabusLoading(false);
        setShowSyllabus(false);
      }
    } catch (err) {
      console.error("Error uploading syllabus:", err);
      alert("Error uploading syllabus.");
      setSyllabusLoading(false);
      setShowSyllabus(false);
    }
    syllabusInputRef.current.value = "";
  };

  const handleToggleTopic = (unitIndex, topicIndex) => {
    let shouldEmitMessage = false;
    let topicName = "";
    let unitName = "";
    let newSyllabus = null;

    setSyllabus(prev => {
      if (!prev) return prev;
      
      const newDoneState = !prev.units[unitIndex].topics[topicIndex].done;
      if (newDoneState) {
        shouldEmitMessage = true;
        topicName = prev.units[unitIndex].topics[topicIndex].name;
        unitName = prev.units[unitIndex].name;
      }

      newSyllabus = {
        ...prev,
        units: prev.units.map((unit, ui) =>
          ui === unitIndex
            ? {
                ...unit,
                topics: unit.topics.map((topic, ti) =>
                  ti === topicIndex ? { ...topic, done: newDoneState } : topic
                )
              }
            : unit
        )
      };
      
      // Persist to server
      socket.emit("update_syllabus", { chatId: id, syllabus: newSyllabus });
      
      return newSyllabus;
    });

    if (shouldEmitMessage) {
      socket.emit("send_message", {
        chatId: id,
        message: `I have completed the topic: "${topicName}" from ${unitName}. Please confirm and give me a quick 2-line summary of what key concepts I should remember.`,
        files: []
      });
    }
  };

  const handleTakeQuiz = (topicName) => {
    if (!localStorage.getItem('token')) {
      setAuthModalMessage("Please login or register to take quizzes.");
      setAuthModalOpen(true);
      return;
    }
    socket.emit("generate_quiz", {
      chatId: id,
      subject: syllabus?.subject || "Subject",
      topic: topicName
    });
  };

  const removePendingFile = (fileName) => {
    setPendingFiles(prev => prev.filter(f => f.name !== fileName));
  };

  if (!chat) return (
    <div className="chat-view-container">
      <div className="chat-loading-state">
        <div className="chat-loading-spinner" />
        <p>Loading chat…</p>
      </div>
    </div>
  );

  return (
    <div className="chat-view-container" style={{ position: 'relative', display: 'flex', gap: '20px' }}>

      {/* Main chat area */}
      <div className={`chat-main-area ${showSyllabus && syllabus ? 'with-sidebar' : ''}`}>
        <div className="chat-messages">
          {chat.messages.map(msg => (
            <div key={msg.id} className={`message ${msg.sender === 'user' ? 'user' : 'ai'}`}>
              <div className="message-content">
                {msg.files && msg.files.length > 0 && (
                  <div className="message-files">
                    {msg.files.map((file, idx) => (
                      <div key={idx} className="file-chip">📎 {file.name}</div>
                    ))}
                  </div>
                )}
                {msg.isTyping && !msg.text ? (
                  <div className="pulse" style={{ opacity: 0.7, fontStyle: 'italic', fontSize: '0.9rem' }}>Twin ai is typing...</div>
                ) : msg.type === 'quiz' && msg.quiz ? (
                  <QuizCard 
                    quizData={msg.quiz} 
                    initialSession={msg.quizSession}
                    onSessionUpdate={(updates) => {
                      socket.emit("update_message", { 
                        chatId: id, 
                        messageId: msg.id, 
                        updates: { quizSession: updates } 
                      });
                      // Also update local state to keep it in sync
                      setChat(prev => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          messages: prev.messages.map(m => m.id === msg.id ? { ...m, quizSession: updates } : m)
                        };
                      });
                    }}
                  />
                ) : (
                  <ReactMarkdown>{msg.text || (msg.files?.length > 0 ? "" : "...")}</ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-wrapper">
          <div className="chat-input-inner">
            {pendingFiles.length > 0 && (
              <div className="pending-files fade-in">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="pending-file-chip">
                    <span>{file.name}</span>
                    <button onClick={() => removePendingFile(file.name)} className="remove-file-btn">×</button>
                  </div>
                ))}
              </div>
            )}
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
              <button className="submit-arrow-button" onClick={handleSend} title="Send Message">➔</button>

              {/* Plus button with dropdown menu */}
              <div className="plus-menu-wrapper" ref={plusMenuRef}>
                <button
                  className={`plus-button ${plusMenuOpen ? 'open' : ''}`}
                  onClick={() => setPlusMenuOpen(o => !o)}
                  title="Attach"
                >+</button>
                {plusMenuOpen && (
                  <div className="plus-dropdown fade-in">
                    <button className="plus-dropdown-item" onClick={handleUploadClick}>
                      <span className="plus-dropdown-icon">📎</span>
                      <div>
                        <div className="plus-dropdown-label">Upload File</div>
                        <div className="plus-dropdown-desc">PDF, image, or text</div>
                      </div>
                    </button>
                    <div className="plus-dropdown-divider" />
                    <button className="plus-dropdown-item syllabus-option" onClick={handleSyllabusUploadClick}>
                      <span className="plus-dropdown-icon">📚</span>
                      <div>
                        <div className="plus-dropdown-label">Upload Syllabus</div>
                        <div className="plus-dropdown-desc">AI tracks your topics</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} multiple />
              <input type="file" ref={syllabusInputRef} onChange={handleSyllabusFileChange} style={{ display: 'none' }} accept=".pdf,.txt,.doc,.docx,image/*" />
            </div>
          </div>
        </div>
      </div>

      {/* Syllabus sidebar */}
      {showSyllabus && (
        <SyllabusTracker
          syllabus={syllabus}
          isLoading={syllabusLoading}
          onToggleTopic={handleToggleTopic}
          onTakeQuiz={handleTakeQuiz}
          onClose={() => setShowSyllabus(false)}
        />
      )}

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} message={authModalMessage} />
    </div>
  );
};

export default ChatView;
