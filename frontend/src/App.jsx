import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import './App.css';

const Navbar = () => {
  const [user, setUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const loadUser = () => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    loadUser();
    window.addEventListener("authChange", loadUser);
    return () => window.removeEventListener("authChange", loadUser);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event("authChange"));
    setDropdownOpen(false);
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="logo-container">
        <Link to="/" className="logo-pill">
          Twin
        </Link>
      </div>
      <div className="nav-links">
        <Link to="/chats" className="nav-link">Chats</Link>
        {!user ? (
          <>
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/register" className="nav-link">Register</Link>
          </>
        ) : (
          <div className="profile-menu">
            <button 
              className="profile-logo" 
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </button>
            {dropdownOpen && (
              <div className="dropdown-menu fade-in">
                <div className="dropdown-header">
                  <strong>{user.username}</strong>
                  <span>{user.email}</span>
                </div>
                <hr className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { setDropdownOpen(false); navigate('/profile'); }}>Profile Details</button>
                <button className="dropdown-item logout" onClick={handleLogout}>Log Out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

const Home = () => (
  <section className="hero">
    <h1 className="hero-title fade-in">Elevate Your Learning.</h1>
    <div className="action-box fade-in" style={{ animationDelay: '0.2s' }}>
      <div className="study-input-container">
        <input 
          type="text" 
          className="study-input" 
          placeholder="Study with ai"
          autoFocus
        />
        <button className="plus-button">+</button>
      </div>
    </div>
  </section>
);

const Placeholder = ({ title }) => (
  <div className="page-content">
    <h1 className="hero-title">{title}</h1>
    <p>This page is currently empty, but the navigation works!</p>
    <Link to="/" style={{ color: 'var(--accent-color)', marginTop: '20px', display: 'inline-block' }}>
      Go back Home
    </Link>
  </div>
);

function App() {
  return (
    <Router>
      <div className="App">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chats" element={<Placeholder title="Chats" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Placeholder title="Profile" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
