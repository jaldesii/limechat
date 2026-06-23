import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Hero.scss";

// ✅ Telegram SVG Icon Component
function TelegramIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.87-1.25 4.79-2.08 5.76-2.48 2.74-1.14 3.31-1.34 3.68-1.34.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
    </svg>
  );
}

// ✅ Phone SVG Icon Component
function PhoneIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" />
    </svg>
  );
}

// ✅ Install Icon (Phone + Arrow Down)
function InstallIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" />
      <path d="M12 8v6M9 11l3 3 3-3" />
    </svg>
  );
}

export default function Hero() {
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setTimeout(() => {
        setShowInstallBtn(true);
        setShowInstallBanner(true);
      }, 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBtn(false);
      setShowInstallBanner(false);
      setInstallPrompt(null);
      console.log('🎉 LimeChat installed!');
    });

    const fallbackTimer = setTimeout(() => {
      if (!installPrompt && !isInstalled) {
        setShowInstallBanner(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('✅ User accepted install');
        setIsInstalled(true);
      } else {
        console.log('❌ User declined install');
      }

      setInstallPrompt(null);
      setShowInstallBtn(false);
      setShowInstallBanner(false);
    } else if (isIOS) {
      alert('To install LimeChat on your iPhone/iPad:\n\n1. Tap the Share button 📤\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"');
      setShowInstallBanner(false);
    } else {
      alert('To install LimeChat on your computer:\n\n1. Click the install icon (⊕) in the address bar\n2. Or use Chrome Menu → Install LimeChat');
      setShowInstallBanner(false);
    }
  };

  return (
    <div className="hero">
      {/* Navbar */}
      <nav className="hero__nav">
        <div className="hero__nav-left">
          <span className="hero__logo">
            <img src="/icon.png" alt="LimeChat" className="hero__logo-img" />
            LimeChat
          </span>
        </div>
        <div className="hero__nav-right">
          {/* ✅ Telegram Contact Link */}
          <a
            href="https://t.me/adminlimech"
            target="_blank"
            rel="noopener noreferrer"
            className="hero__telegram-link"
            aria-label="Contact on Telegram"
          >
            <TelegramIcon size={20} />
            <span>Contact</span>
          </a>

          {!isInstalled && showInstallBtn && (
            <button
              id="pwa-install-btn"
              className="hero__install-btn"
              onClick={handleInstall}
            >
              <PhoneIcon size={16} />
              <span>Install App</span>
            </button>
          )}
          <button className="hero__nav-btn" onClick={() => navigate('/terms')}>
            Start Chatting
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="hero__content">
        <div className="hero__text">
          <h1 className="hero__title">
            Chat with someone
            <br />
            <span className="hero__title-accent">new today.</span>
          </h1>
          <p className="hero__subtitle">
            Connect anonymously with people near you.
            No sign-ups. No profiles. Just real conversations.
          </p>

          <div className="hero__actions">
            <button className="hero__cta" onClick={() => navigate('/terms')}>
              Find Someone to Chat
              <span className="hero__cta-arrow">→</span>
            </button>
            <button className="hero__link" onClick={() => navigate('/terms')}>
              Terms & Conditions
            </button>
          </div>

          {/* ✅ Telegram CTA */}
          <div className="hero__telegram-cta">
            <TelegramIcon size={18} />
            <div className="hero__telegram-cta-text">
              <span>Need help? Contact us on </span>
              <a
                href="https://t.me/admlimech"
                target="_blank"
                rel="noopener noreferrer"
                className="hero__telegram-cta-link"
              >
                Telegram
              </a>
              <span className="hero__telegram-cta-divider">·</span>
              <span className="hero__telegram-cta-promo">
                Want to post an announcement? DM for pricing (₱)
              </span>
            </div>
          </div>

          {/* ✅ PWA Install banner */}
          {!isInstalled && showInstallBanner && (
            <div className="hero__install-banner">
              <div className="hero__install-banner-icon">
                <InstallIcon size={36} />
              </div>
              <div className="hero__install-banner-text">
                <strong>Add to Home Screen</strong>
                <span>
                  {isIOS
                    ? 'Tap Share → Add to Home Screen'
                    : 'Install LimeChat for a better experience'}
                </span>
              </div>
              <button className="hero__install-banner-btn" onClick={handleInstall}>
                {isIOS ? 'How to Install' : 'Install'}
              </button>
            </div>
          )}

          <div className="hero__stats">
            <div className="hero__stat">
              <span className="hero__stat-num">100+</span>
              <span className="hero__stat-lbl">Daily Chats</span>
            </div>
            <div className="hero__stat-divider" />
            <div className="hero__stat">
              <span className="hero__stat-num">100%</span>
              <span className="hero__stat-lbl">Anonymous</span>
            </div>
            <div className="hero__stat-divider" />
            <div className="hero__stat">
              <span className="hero__stat-num">Free</span>
              <span className="hero__stat-lbl">Forever</span>
            </div>
          </div>
        </div>

        {/* Visual */}
        <div className="hero__visual">
          <div className="hero__card">
            <div className="hero__card-header">
              <div className="hero__card-dot hero__card-dot--green" />
              <div className="hero__card-dot hero__card-dot--lime" />
              <div className="hero__card-dot hero__card-dot--gray" />
            </div>
            <div className="hero__card-body">
              <div className="hero__msg hero__msg--received">
                <span className="hero__msg-avatar">J</span>
                <div className="hero__msg-bubble">Hey! How's your day?</div>
              </div>
              <div className="hero__msg hero__msg--sent">
                <div className="hero__msg-bubble">Pretty good! You?</div>
              </div>
              <div className="hero__msg hero__msg--received">
                <span className="hero__msg-avatar">J</span>
                <div className="hero__msg-bubble">Amazing! Where are you from?</div>
              </div>
            </div>
            <div className="hero__card-input">
              <span className="hero__card-input-text">Type a message...</span>
              <span className="hero__card-input-send">➤</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
     {/* Footer */}
<footer className="hero__footer">
  <span>© 2026 LimeChat</span>
  <span className="hero__footer-dot">·</span>
  <button className="hero__footer-link" onClick={() => navigate('/terms')}>
    Terms
  </button>
</footer>
    </div>
  );
}