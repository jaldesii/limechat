import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDarkMode } from "../context/DarkModeContext";
import "./Hero.scss";

// ✅ SVG Icons
function ChatIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);}
function AnonymousIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);}
function LocationIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);}
function ReactionIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>);}
function ReplyIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>);}
function BellIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);}
function Step1Icon() { return (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>);}
function Step2Icon() { return (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32" /></svg>);}
function Step3Icon() { return (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>);}
function Step4Icon() { return (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>);}
function ShieldIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);}
function TelegramIcon({ size = 24 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.87-1.25 4.79-2.08 5.76-2.48 2.74-1.14 3.31-1.34 3.68-1.34.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>);}
function PhoneIcon({ size = 24 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12" y2="18.01" /></svg>);}
function InstallIcon({ size = 24 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12" y2="18.01" /><path d="M12 8v6M9 11l3 3 3-3" /></svg>);}
function GroupIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);}
function MembersIcon2() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);}
// ✅ Dark Mode Icons
function SunIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>);}
function MoonIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>);}

// ✅ New icons for new features
function CallIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);}
function EmojiFeatureIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>);}
function EditFeatureIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);}
function DeleteFeatureIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);}
function LongPressIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);}
function SkeletonIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="4" rx="2" /><rect x="2" y="10" width="20" height="4" rx="2" /><rect x="2" y="17" width="14" height="4" rx="2" /></svg>);}
function RenameIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);}

export default function Hero() {
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  
  // ✅ Support Modal
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [dontShowSupport, setDontShowSupport] = useState(() => {
    return localStorage.getItem('hideSupportModal') === 'true';
  });

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) { setIsInstalled(true); return; }
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);
    const handleBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); setTimeout(() => { setShowInstallBtn(true); setShowInstallBanner(true); }, 2000); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => { setIsInstalled(true); setShowInstallBtn(false); setShowInstallBanner(false); setInstallPrompt(null); });
    const fallbackTimer = setTimeout(() => { if (!installPrompt && !isInstalled) setShowInstallBanner(true); }, 5000);
    return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstall); clearTimeout(fallbackTimer); };
  }, []);

  useEffect(() => {
    if (!dontShowSupport) {
      const timer = setTimeout(() => setShowSupportModal(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [dontShowSupport]);

  const handleInstall = async () => {
    if (installPrompt) { installPrompt.prompt(); const { outcome } = await installPrompt.userChoice; if (outcome === 'accepted') setIsInstalled(true); setInstallPrompt(null); setShowInstallBtn(false); setShowInstallBanner(false); }
    else if (isIOS) { alert('To install CallChat:\n\n1. Tap Share\n2. Add to Home Screen\n3. Tap Add'); setShowInstallBanner(false); }
    else { alert('To install CallChat:\n\n1. Click install icon in address bar\n2. Or Chrome Menu → Install'); setShowInstallBanner(false); }
  };

  const closeSupportModal = () => {
    setShowSupportModal(false);
    if (dontShowSupport) localStorage.setItem('hideSupportModal', 'true');
  };

const features = [
    { icon: <ChatIcon />, title: "Real-time Chat", desc: "Instant messaging with no delays" },
    { icon: <CallIcon />, title: "Voice Calls", desc: "Call anyone with just a room code" },
    { icon: <GroupIcon />, title: "Group Chat", desc: "Create or join groups up to 10 users" },
    { icon: <MembersIcon2 />, title: "Members Sidebar", desc: "See who's in your group chat" },
    { icon: <EmojiFeatureIcon />, title: "Emoji Picker", desc: "Express yourself with emojis" },
    { icon: <EditFeatureIcon />, title: "Edit Messages", desc: "Edit your sent messages anytime" },
    { icon: <DeleteFeatureIcon />, title: "Delete Messages", desc: "Remove messages you sent" },
    { icon: <LongPressIcon />, title: "Long Press Menu", desc: "Hold message for quick actions" },
    { icon: <SkeletonIcon />, title: "Smooth Loading", desc: "Skeleton screens while loading" },
    { icon: <ReactionIcon />, title: "Message Reactions", desc: "Double-tap to react with hearts" },
    { icon: <ReplyIcon />, title: "Reply & Quote", desc: "Swipe or click to reply" },
    { icon: <RenameIcon />, title: "Rename Group", desc: "Customize your group name" },
    { icon: <BellIcon />, title: "Announcements", desc: "Stay updated with broadcasts" },
];

 const steps = [
    { icon: <Step1Icon />, title: "Create Profile", desc: "Enter your name and location" },
    { icon: <Step2Icon />, title: "Choose Mode", desc: "1v1 Chat, Voice Call, or Group" },
    { icon: <Step3Icon />, title: "Start Chatting", desc: "Real-time anonymous conversation" },
    { icon: <Step4Icon />, title: "Express Yourself", desc: "Emojis, edit, delete & more" },
];

  const badges = [
    { icon: <ShieldIcon />, text: "Chat & Voice Calls" },
    { icon: <ShieldIcon />, text: "100% Anonymous" },
    { icon: <ShieldIcon />, text: "No Data Stored" },
    { icon: <ShieldIcon />, text: "Free Forever" },
    { icon: <ShieldIcon />, text: "Made in PH 🇵🇭" },
  ];

  return (
    <div className="hero">
      <nav className="hero__nav">
        <div className="hero__nav-left"><span className="hero__logo"><img src="/icon.png" alt="CallChat" className="hero__logo-img" />LimeChat</span></div>
        <div className="hero__nav-right">
          <button className="hero__dark-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode" title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <a href="https://t.me/admlimech" target="_blank" rel="noopener noreferrer" className="hero__telegram-link"><TelegramIcon size={20} /><span>Contact</span></a>
          {!isInstalled && showInstallBtn && <button className="hero__install-btn" onClick={handleInstall}><PhoneIcon size={16} /><span>Install App</span></button>}
          <button className="hero__nav-btn" onClick={() => navigate('/terms')}>Start Chatting</button>
        </div>
      </nav>

      <div className="hero__content">
        <div className="hero__text">
          <h1 className="hero__title">Chat & Call<br /><span className="hero__title-accent">anonymously.</span></h1>
          <p className="hero__subtitle">Chat and call anonymously with people near you. No sign-ups. No profiles. Just real conversations.</p>
          <div className="hero__actions"><button className="hero__cta" onClick={() => navigate('/terms')}>Start Chatting Now<span className="hero__cta-arrow">→</span></button><button className="hero__link" onClick={() => navigate('/terms')}>Terms & Conditions</button></div>
          <div className="hero__telegram-cta"><TelegramIcon size={18} /><div className="hero__telegram-cta-text"><span>Need help? Contact us on </span><a href="https://t.me/admlimech" target="_blank" rel="noopener noreferrer" className="hero__telegram-cta-link">Telegram</a><span className="hero__telegram-cta-divider">·</span><span className="hero__telegram-cta-promo">Want to post an announcement? DM for pricing (₱)</span></div></div>
          {!isInstalled && showInstallBanner && (<div className="hero__install-banner"><div className="hero__install-banner-icon"><InstallIcon size={36} /></div><div className="hero__install-banner-text"><strong>Add to Home Screen</strong><span>{isIOS ? 'Tap Share → Add to Home Screen' : 'Install for a better experience'}</span></div><button className="hero__install-banner-btn" onClick={handleInstall}>{isIOS ? 'How to Install' : 'Install'}</button></div>)}
          <div className="hero__stats">
            <div className="hero__stat"><span className="hero__stat-num">100+</span><span className="hero__stat-lbl">Daily Chats</span></div>
            <div className="hero__stat-divider" />
            <div className="hero__stat"><span className="hero__stat-num">📞</span><span className="hero__stat-lbl">Voice Calls</span></div>
            <div className="hero__stat-divider" />
            <div className="hero__stat"><span className="hero__stat-num">Free</span><span className="hero__stat-lbl">Forever</span></div>
          </div>
        </div>
        
        {/* ✅ DUAL PHONE PREVIEW - Chat + Call */}
        <div className="hero__visual">
          <div className="hero__phones">
            {/* Chat Preview Phone */}
            <div className="hero__card hero__card--chat">
              <div className="hero__card-header"><div className="hero__card-dot hero__card-dot--green" /><div className="hero__card-dot hero__card-dot--lime" /><div className="hero__card-dot hero__card-dot--gray" /></div>
              <div className="hero__card-body">
                <div className="hero__msg hero__msg--received"><span className="hero__msg-avatar">J</span><div className="hero__msg-bubble">Hey! How's your day?</div></div>
                <div className="hero__msg hero__msg--sent"><div className="hero__msg-bubble">Pretty good! You?</div></div>
                <div className="hero__msg hero__msg--received"><span className="hero__msg-avatar">J</span><div className="hero__msg-bubble">Wanna hop on a call? 📞</div></div>
              </div>
              <div className="hero__card-input"><span className="hero__card-input-text">Type a message...</span><span className="hero__card-input-send">➤</span></div>
              <div className="hero__card-label">💬 Chat</div>
            </div>
            
            {/* Call Preview Phone */}
            <div className="hero__card hero__card--call">
              <div className="hero__call-screen">
                <div className="hero__call-avatar">
                  <span>J</span>
                </div>
                <div className="hero__call-name">Jamie</div>
                <div className="hero__call-status">📞 On call · 05:32</div>
                <div className="hero__call-audio-waves">
                  <span className="hero__call-wave"></span>
                  <span className="hero__call-wave"></span>
                  <span className="hero__call-wave"></span>
                  <span className="hero__call-wave"></span>
                  <span className="hero__call-wave"></span>
                </div>
                <div className="hero__call-actions">
                  <button className="hero__call-btn hero__call-btn--mic">🎤</button>
                  <button className="hero__call-btn hero__call-btn--end">🔴</button>
                  <button className="hero__call-btn hero__call-btn--speaker">🔊</button>
                </div>
              </div>
              <div className="hero__card-label">📞 Voice Call</div>
            </div>
          </div>
        </div>
      </div>

      <div className="hero__how"><h2 className="hero__how-title">How It Works</h2><div className="hero__how-steps">{steps.map((s, i) => (<div key={i} className="hero__how-step"><div className="hero__how-step-num">{i + 1}</div><div className="hero__how-step-icon">{s.icon}</div><h3 className="hero__how-step-title">{s.title}</h3><p className="hero__how-step-desc">{s.desc}</p></div>))}</div></div>

      <div className="hero__mockup"><div className="hero__mockup-text"><h2 className="hero__mockup-title">See It in Action</h2><p className="hero__mockup-desc">Chat, call, and connect. Simple, fast, and completely anonymous.</p><div className="hero__mockup-badges">{badges.map((b, i) => (<div key={i} className="hero__mockup-badge"><span className="hero__mockup-badge-icon">{b.icon}</span>{b.text}</div>))}</div></div>
        <div className="hero__mockup-phone"><div className="hero__mockup-phone-frame"><div className="hero__mockup-phone-screen"><div className="hero__mockup-phone-status"><span className="hero__mockup-phone-time">9:41</span><span className="hero__mockup-phone-icons">●●●●</span></div><div className="hero__mockup-phone-header"><span className="hero__mockup-phone-back">←</span><div className="hero__mockup-phone-avatar">J</div><div className="hero__mockup-phone-user"><div className="hero__mockup-phone-name">Jamie</div><div className="hero__mockup-phone-location">📍 Manila</div></div><div className="hero__mockup-phone-dot" /></div><div className="hero__mockup-phone-chat"><div className="hero__mockup-phone-msg hero__mockup-phone-msg--received">Hey! How's your day?</div><div className="hero__mockup-phone-msg hero__mockup-phone-msg--sent">Pretty good! Just chilling</div><div className="hero__mockup-phone-msg hero__mockup-phone-msg--received">Nice! Wanna call? 📞</div><div className="hero__mockup-phone-msg hero__mockup-phone-msg--sent">Sure! Let's do it</div><div className="hero__mockup-phone-typing"><span /><span /><span /></div></div><div className="hero__mockup-phone-input"><div className="hero__mockup-phone-input-field">Type a message...</div><div className="hero__mockup-phone-input-send">➤</div></div><div style={{ padding: '6px 0', background: 'white' }}><div className="hero__mockup-phone-home" /></div></div></div></div></div>

      <div className="hero__features"><h2 className="hero__features-title">Why LimeChat?</h2><div className="hero__features-grid">{features.map((f, i) => (<div key={i} className="hero__feature-card"><div className="hero__feature-icon">{f.icon}</div><h3 className="hero__feature-name">{f.title}</h3><p className="hero__feature-desc">{f.desc}</p></div>))}</div></div>

    <footer className="hero__footer">
  <span>© 2026 LimeChat</span>
  <span className="hero__footer-dot">·</span>
  <button className="hero__footer-link" onClick={() => navigate('/faq')}>FAQ</button>
  <span className="hero__footer-dot">·</span>
  <button className="hero__footer-link" onClick={() => navigate('/terms')}>Terms</button>
</footer>

      {/* ✅ Support Modal */}
      {showSupportModal && (
        <div className="support-modal-overlay" onClick={closeSupportModal}>
          <div className="support-modal" onClick={(e) => e.stopPropagation()}>
            <button className="support-modal__close" onClick={closeSupportModal}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            <div className="support-modal__icon">🦊</div>
            <h2 className="support-modal__title">Support LimeChat</h2>
            <p className="support-modal__desc">Help us improve your experience! Your support keeps CallChat running and helps us add new features like voice calls and more.</p>
            <div className="support-modal__cards">
              <div className="support-modal__card">
                <div className="support-modal__card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                <h3>Give Feedback</h3><p>Tell us what you think! Report bugs or suggest features.</p>
                <a href="https://t.me/admlimech" target="_blank" rel="noopener noreferrer" className="support-modal__btn support-modal__btn--telegram"><TelegramIcon size={16} /> DM on Telegram</a>
              </div>
              <div className="support-modal__card">
                <div className="support-modal__card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
                <h3>Post Announcement</h3><p>Want to broadcast a message to all users? Avail our announcement feature.</p>
                <a href="https://t.me/admlimech" target="_blank" rel="noopener noreferrer" className="support-modal__btn support-modal__btn--announce"><TelegramIcon size={16} /> Inquire Now (₱)</a>
              </div>
            </div>
            <div className="support-modal__footer">
              <label className="support-modal__checkbox"><input type="checkbox" checked={dontShowSupport} onChange={(e) => setDontShowSupport(e.target.checked)} /> Don't show this again</label>
              <button className="support-modal__skip" onClick={closeSupportModal}>Maybe later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}