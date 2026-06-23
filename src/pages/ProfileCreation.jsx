import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ProfileCreation.scss";

export default function ProfileCreation() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [showReturnMessage, setShowReturnMessage] = useState(false);

  useEffect(() => {
    const justAcceptedTerms = sessionStorage.getItem('justAcceptedTerms');
    if (justAcceptedTerms) {
      sessionStorage.removeItem('justAcceptedTerms');
    }

    const justLeft = sessionStorage.getItem('justLeftChat');
    if (justLeft) {
      setShowReturnMessage(true);
      sessionStorage.removeItem('justLeftChat');
      
      setTimeout(() => {
        setShowReturnMessage(false);
      }, 5000);
    }
  }, []);

  const startChat = () => {
    if (!name || !location) return;

    localStorage.setItem(
      "user",
      JSON.stringify({ name, location })
    );

    navigate("/waiting");
  };

  return (
    <div className="profile-creation">
      <div className="profile-creation__card">
        
        {/* Return Message */}
        {showReturnMessage && (
          <div className="profile-creation__return-msg">
            <strong>You left the chat.</strong>
            <br />
            Create a new profile to find someone else.
          </div>
        )}

        {/* Logo/Brand */}
        <div className="profile-creation__brand">
          <div className="profile-creation__icon">
            <img src="/icon.png" alt="LimeChat" className="profile-creation__icon-img" />
          </div>
          <span className="profile-creation__brand-name">LimeChat</span>
        </div>

        {/* Title */}
        <h1 className="profile-creation__title">Find Someone to Chat</h1>
        <p className="profile-creation__subtitle">Enter your details to get matched randomly</p>

        {/* Form */}
        <div className="profile-creation__form">
          
          {/* Name Input */}
          <div className="profile-creation__input-group">
            <label className="profile-creation__label">Your Name</label>
            <input
              className="profile-creation__input profile-creation__input--name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={20}
            />
          </div>

          {/* Location Input */}
          <div className="profile-creation__input-group">
            <label className="profile-creation__label">Your Location</label>
            <input
              className="profile-creation__input profile-creation__input--location"
              placeholder="Enter your location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={30}
            />
          </div>

          {/* Start Button */}
          <button 
            className="profile-creation__start-btn"
            onClick={startChat}
            disabled={!name || !location}
          >
            {!name || !location ? 'Fill in both fields' : 'Start Chat'}
          </button>
        </div>

        {/* Footer with Terms Link */}
        <div className="profile-creation__footer">
          <p className="profile-creation__footer-text">
            By clicking "Start Chat", you agree to our{' '}
            <span 
              className="profile-creation__footer-link"
              onClick={() => navigate('/')}
            >
              Terms & Conditions
            </span>
          </p>
          <p className="profile-creation__footer-hint">
            You'll be matched with a random person near you
          </p>
        </div>
      </div>
    </div>
  );
}