import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./TermsConditions.scss";

// ✅ SVG Icons
function ChatIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);}
function AnonymousIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);}
function LockIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);}

export default function TermsConditions() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // ✅ App version - update this when you release new versions
  const APP_VERSION = "1.9";
  const LAST_UPDATED = "June 24, 2026";

  const handleAgree = () => {
    if (dontShowAgain) localStorage.setItem('termsAccepted', 'true');
    navigate('/profile');
  };

  const handleDecline = () => {
    window.close();
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Poppins',sans-serif;text-align:center;background:#fafafa">
        <div><h1 style="color:#18181b">You must accept the Terms to continue</h1><p style="color:#71717a">Please close this tab and try again.</p></div>
      </div>`;
  };

  const features = [
    { icon: <ChatIcon />, title: "Real-time Chat", desc: "Instant messaging with no delays" },
    { icon: <AnonymousIcon />, title: "100% Anonymous", desc: "No sign-ups, no profiles needed" },
    { icon: <LockIcon />, title: "Private & Secure", desc: "Messages are never stored" },
  ];

  return (
    <div className="terms">
      <div className="terms__card">
        
        {/* Header */}
        <div className="terms__header">
          <div className="terms__logo">
            <img src="/icon.png" alt="LimeChat" className="terms__logo-img" />
          </div>
          <h1 className="terms__brand">LimeChat</h1>
          <p className="terms__tagline">Chat anonymously with people near you</p>
        </div>

        {/* ✅ Features Preview */}
        <div className="terms__features">
          <h3 className="terms__features-title">Why LimeChat?</h3>
          <div className="terms__features-row">
            {features.map((f, i) => (
              <div key={i} className="terms__feature-item">
                <div className="terms__feature-icon">{f.icon}</div>
                <span className="terms__feature-name">{f.title}</span>
                <span className="terms__feature-desc">{f.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="terms__content">
          
          <section className="terms__section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using <strong>LimeChat</strong> ("the Service"), you agree to be bound by these Terms and Conditions. 
              If you do not agree, you may not use the Service.
            </p>
          </section>

          <section className="terms__section">
            <h2>2. Description of Service</h2>
            <p>LimeChat connects you randomly with another user based on location. You can:</p>
            <ul>
              <li>Create a temporary profile</li>
              <li>Get matched with someone random</li>
              <li>Chat in real-time anonymously</li>
            </ul>
          </section>

          <section className="terms__section">
            <h2>3. User Conduct</h2>
            <p>You agree <strong>NOT</strong> to:</p>
            <ul>
              <li>Harass, abuse, or harm other users</li>
              <li>Share personal or identifying information</li>
              <li>Send spam or malicious content</li>
              <li>Solicit money, goods, or services</li>
              <li>Share explicit or inappropriate content</li>
              <li>Use the Service for illegal purposes</li>
            </ul>
          </section>

          <section className="terms__section">
            <h2>4. Privacy & Anonymity</h2>
            <ul>
              <li>Chats are <strong>anonymous</strong> and temporary</li>
              <li>Messages are <strong>not stored</strong> after the chat ends</li>
              <li>No email, phone, or personal ID required</li>
              <li>Your location is only what you provide</li>
            </ul>
          </section>

          <section className="terms__section">
            <h2>5. Important Reminders</h2>
            <ul>
              <li>You must be at least <strong>13 years old</strong></li>
              <li>Chat sessions end when either user leaves</li>
              <li>You cannot reconnect with the same user</li>
              <li>We are not responsible for user behavior</li>
            </ul>
          </section>

        </div>

        {/* Agreement Section */}
        <div className="terms__agreement">
          
          <label className="terms__checkbox">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
            <span className="terms__checkbox-mark" />
            <span className="terms__checkbox-text">Don't show this again</span>
          </label>

          <label className="terms__checkbox">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="terms__checkbox-mark" />
            <span className="terms__checkbox-text">I have read and agree to the <strong>Terms & Conditions</strong></span>
          </label>

          <div className="terms__buttons">
            <button className="terms__btn terms__btn--agree" onClick={handleAgree} disabled={!agreed}>
              I Agree — Start Chatting
            </button>
            <button className="terms__btn terms__btn--decline" onClick={handleDecline}>I Decline</button>
          </div>

          <p className="terms__date">Last updated: {LAST_UPDATED} • Version {APP_VERSION}</p>
        </div>

      </div>
    </div>
  );
}