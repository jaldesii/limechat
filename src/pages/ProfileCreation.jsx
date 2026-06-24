import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ProfileCreation.scss";

// ✅ SVG Home Icon
function HomeIcon() { 
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export default function ProfileCreation() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [showReturnMessage, setShowReturnMessage] = useState(false);

  useEffect(() => {
    const justAcceptedTerms = sessionStorage.getItem('justAcceptedTerms');
    if (justAcceptedTerms) sessionStorage.removeItem('justAcceptedTerms');
    const justLeft = sessionStorage.getItem('justLeftChat');
    if (justLeft) {
      setShowReturnMessage(true);
      sessionStorage.removeItem('justLeftChat');
      setTimeout(() => setShowReturnMessage(false), 5000);
    }
    
    // ✅ Pre-fill form if user data exists (when coming back from waiting room)
    const existingUser = localStorage.getItem('user');
    if (existingUser) {
      try {
        const userData = JSON.parse(existingUser);
        if (userData.name) setName(userData.name);
        if (userData.location) setLocation(userData.location);
      } catch (e) {
        // Invalid data, ignore
      }
    }
  }, []);

  const startChat = (mode) => {
    if (!name || !location) return;
    localStorage.setItem("user", JSON.stringify({ name, location }));
    if (mode === '1v1') {
      navigate("/waiting");
    } else {
      navigate("/waiting?mode=group");
    }
  };

  return (
    <div className="profile-creation">
      <div className="profile-creation__card">
        {/* ✅ Home Button - Top Right */}
        <button 
          className="profile-creation__home-btn" 
          onClick={() => navigate('/')} 
          title="Back to Home"
          aria-label="Back to Home"
        >
          <HomeIcon />
          <span>Home</span>
        </button>

        {showReturnMessage && (
          <div className="profile-creation__return-msg">
            <strong>You left the chat.</strong>
            <br />Create a new profile to find someone else.
          </div>
        )}
        <div className="profile-creation__brand">
          <div className="profile-creation__icon">
            <img src="/icon.png" alt="LimeChat" className="profile-creation__icon-img" />
          </div>
          <span className="profile-creation__brand-name">LimeChat</span>
        </div>
        <h1 className="profile-creation__title">Find Someone to Chat</h1>
        <p className="profile-creation__subtitle">Enter your details and choose chat mode</p>
        <div className="profile-creation__form">
          <div className="profile-creation__input-group">
            <label className="profile-creation__label">Your Name</label>
            <input className="profile-creation__input" placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={20} />
          </div>
          <div className="profile-creation__input-group">
            <label className="profile-creation__label">Your Location</label>
            <input className="profile-creation__input" placeholder="Enter your location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={30} />
          </div>
          
          {/* ✅ Chat Mode Selection */}
          <div className="profile-creation__chat-modes">
            <button className="profile-creation__mode-btn profile-creation__mode-btn--1v1" onClick={() => startChat('1v1')} disabled={!name || !location}>
              <span className="profile-creation__mode-icon">👤</span>
              <span className="profile-creation__mode-text">
                <strong>1v1 Chat</strong>
                <small>Random match with one person</small>
              </span>
            </button>
            <button className="profile-creation__mode-btn profile-creation__mode-btn--group" onClick={() => startChat('group')} disabled={!name || !location}>
              <span className="profile-creation__mode-icon">👥</span>
              <span className="profile-creation__mode-text">
                <strong>Group Chat</strong>
                <small>Join or create a group (max 10)</small>
              </span>
            </button>
          </div>
        </div>
        <div className="profile-creation__footer">
          <p className="profile-creation__footer-text">
            By continuing, you agree to our{' '}
            <span className="profile-creation__footer-link" onClick={() => navigate('/')}>Terms & Conditions</span>
          </p>
        </div>
      </div>
    </div>
  );
}