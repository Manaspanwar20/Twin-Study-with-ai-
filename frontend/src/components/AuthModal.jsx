import React from 'react';
import { useNavigate } from 'react-router-dom';

const AuthModal = ({ isOpen, onClose, message }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleOk = () => {
    onClose();
    navigate('/register');
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-content fade-in glass">
        <h3>Authentication Required</h3>
        <p>{message}</p>
        <button className="auth-button" onClick={handleOk} style={{ width: '100%' }}>OK</button>
      </div>
    </div>
  );
};

export default AuthModal;
