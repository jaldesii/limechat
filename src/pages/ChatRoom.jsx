import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../services/socket";
import "./ChatRoom.scss";

// ✅ Countdown timer component
function AnnouncementTimer({ expiresAt }) {
  const [remaining, setRemaining] = useState('');
  
  useEffect(() => {
    const update = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (diff <= 0) { setRemaining(''); return; }
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setRemaining(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  if (!remaining) return null;
  return <span className="chat-announcement__timer">⏱ {remaining}</span>;
}

// ✅ Confetti component
function Confetti({ active }) {
  if (!active) return null;
  
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    color: ['#84cc16', '#a3e635', '#65a30d', '#fbbf24', '#ecfccb'][Math.floor(Math.random() * 5)],
    size: Math.random() * 8 + 4,
  }));

  return (
    <div className="confetti-container">
      {particles.map(p => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            background: p.color,
            width: `${p.size}px`,
            height: `${p.size}px`,
          }}
        />
      ))}
    </div>
  );
}

export default function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [myInfo, setMyInfo] = useState(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(true);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connected");
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  
  // ✅ Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  
  // ✅ Confetti state
  const [showConfetti, setShowConfetti] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const hasLeftRef = useRef(false);
  const hasJoinedRef = useRef(false);

  // ✅ Check if user is at bottom
  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const threshold = 100; // pixels from bottom
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setAutoScroll(isAtBottom);
    setShowScrollBtn(!isAtBottom && messages.length > 0);
  }, [messages.length]);

  // ✅ Scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    setAutoScroll(true);
    setShowScrollBtn(false);
  };

  useEffect(() => {
    const userString = localStorage.getItem('user');
    const partnerString = localStorage.getItem('partner');
    if (!userString || !partnerString) { navigate('/'); return; }

    const user = JSON.parse(userString);
    const partnerData = JSON.parse(partnerString);
    setMyInfo(user);
    setPartner(partnerData);
    socket.emit('joinRoom', roomId);
    hasJoinedRef.current = true;

    // ✅ Trigger confetti on match!
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);

    socket.on('receiveMessage', (data) => {
      setMessages(prev => [...prev, { 
        type: 'message', text: data.message, sender: data.sender, 
        senderName: data.senderName, timestamp: data.timestamp 
      }]);
    });

    socket.on('partnerTyping', () => {
      setPartnerTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 2000);
    });

    socket.on('partnerDisconnected', () => {
      setPartnerOnline(false);
      setConnectionStatus("disconnected");
      setMessages(prev => [...prev, { type: 'system', text: `${partnerData?.name || 'Partner'} disconnected`, timestamp: new Date().toISOString() }]);
    });

    socket.on('partnerReconnected', () => {
      setPartnerOnline(true);
      setConnectionStatus("connected");
      setMessages(prev => [...prev, { type: 'system', text: `${partnerData?.name || 'Partner'} is back`, timestamp: new Date().toISOString() }]);
    });

    socket.on('partnerLeft', (data) => {
      setPartnerOnline(false); setPartnerLeft(true); setConnectionStatus("left");
      const pn = data?.partnerName || partnerData?.name || 'Partner';
      setMessages(prev => {
        if (prev[prev.length-1]?.type === 'system' && prev[prev.length-1].text.includes('left')) return prev;
        return [...prev, { type: 'system', text: `${pn} left`, timestamp: new Date().toISOString() }];
      });
    });

    socket.on('partnerJoined', () => {
      setConnectionStatus("connected");
      setMessages(prev => {
        if (prev.some(m => m.type === 'system' && m.text.includes('joined'))) return prev;
        return [...prev, { type: 'system', text: `${partnerData?.name || 'Partner'} joined`, timestamp: new Date().toISOString() }];
      });
    });

    socket.on('announcement', (data) => {
      console.log("📢 ChatRoom received announcement:", data);
      setAnnouncement(data);
    });

    socket.on('clearAnnouncement', () => {
      console.log("📢 ChatRoom cleared announcement");
      setAnnouncement(null);
    });

    window.history.pushState(null, '', window.location.href);
    const pop = () => { window.history.pushState(null, '', window.location.href); if (!hasLeftRef.current) setShowLeaveModal(true); };
    const unload = (e) => { if (!hasLeftRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const keydown = (e) => { if (!hasLeftRef.current && (e.key === 'F5' || (e.ctrlKey && e.key === 'r'))) { e.preventDefault(); setShowLeaveModal(true); } };
    window.addEventListener('popstate', pop);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('keydown', keydown);
    
    scrollToBottom(false);

    return () => {
      socket.off('receiveMessage'); socket.off('partnerTyping');
      socket.off('partnerDisconnected'); socket.off('partnerReconnected');
      socket.off('partnerLeft'); socket.off('partnerJoined');
      socket.off('announcement'); socket.off('clearAnnouncement');
      window.removeEventListener('popstate', pop);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('keydown', keydown);
    };
  }, [roomId, navigate]);

  // ✅ Scroll handler
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => checkIfAtBottom();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  // ✅ Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom(true);
    }
  }, [messages, autoScroll]);

  const sendMessage = () => {
    if (!message.trim() || !partnerOnline) return;
    socket.emit('sendMessage', { roomId, message, sender: socket.id, senderName: myInfo.name, timestamp: new Date().toISOString() });
    setMessages(prev => [...prev, { type: 'message', text: message, sender: socket.id, senderName: "You", timestamp: new Date().toISOString() }]);
    setMessage("");
    // Auto-scroll after sending
    setAutoScroll(true);
  };

  const leave = () => {
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    socket.emit('leaveRoom', { roomId, partnerName: myInfo?.name });
    localStorage.removeItem('partner');
    localStorage.removeItem('roomId');
    navigate('/', { replace: true });
  };

  const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const init = (n) => (n || '?')[0].toUpperCase();

  return (
    <div className="chat-room">
      {/* ✅ Confetti */}
      <Confetti active={showConfetti} />

      {/* Leave Modal */}
      {showLeaveModal && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <p className="leave-modal__text">You're chatting with <strong>{partner?.name}</strong></p>
            <div className="leave-modal__warning">
              <p>If you leave, {partner?.name} will be notified.</p>
            </div>
            <div className="leave-modal__actions">
              <button className="leave-modal__btn leave-modal__btn--stay" onClick={() => { setShowLeaveModal(false); window.history.pushState(null, '', window.location.href); }}>Stay</button>
              <button className="leave-modal__btn leave-modal__btn--leave" onClick={leave}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__partner-info">
          <div className="chat-header__avatar">{init(partner?.name)}</div>
          <div className="chat-header__details">
            <p className="chat-header__name">
              <span className={`chat-header__status chat-header__status--${connectionStatus}`} />
              {partner?.name || 'Unknown'}
            </p>
            <p className="chat-header__location">{partner?.location || ''}</p>
          </div>
        </div>
        {!partnerLeft && (
          <button className="chat-header__leave-btn" onClick={() => setShowLeaveModal(true)}>Leave</button>
        )}
      </div>

      {/* Announcement Banner */}
      {announcement && (
        <div className="chat-announcement">
          <span className="chat-announcement__icon">📢</span>
          <span className="chat-announcement__text">{announcement.text}</span>
          {announcement.duration > 0 && announcement.expiresAt && (
            <AnnouncementTimer expiresAt={announcement.expiresAt} />
          )}
          {announcement.duration === 0 && (
            <span className="chat-announcement__badge">Admin</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {/* ✅ Scroll to bottom button */}
        {showScrollBtn && (
          <button className="scroll-to-bottom" onClick={() => scrollToBottom(true)}>
            ↓ New messages
          </button>
        )}

        {messages.length === 0 && !partnerLeft && (
          <div className="chat-messages__empty">
            <div className="chat-messages__empty-icon">💬</div>
            <p className="chat-messages__empty-text">Start chatting with {partner?.name}</p>
            <p className="chat-messages__empty-subtext">Send a message to begin</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.type === 'system' ? (
              <div className="system-message">
                <span className="system-message__text">{msg.text}</span>
              </div>
            ) : (
              <div className={`message ${msg.senderName === "You" ? 'message--sent' : 'message--received'}`}>
                <span className="message__sender">{msg.senderName === "You" ? 'You' : msg.senderName}</span>
                <div className={`message__bubble ${msg.senderName === "You" ? 'message__bubble--sent' : 'message__bubble--received'}`}>{msg.text}</div>
                <span className="message__time">{fmt(msg.timestamp)}</span>
              </div>
            )}
          </div>
        ))}
        
        {partnerTyping && partnerOnline && (
          <div className="typing-indicator">
            <div className="typing-indicator__dots"><span /><span /><span /></div>
            {partner?.name} typing...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input or Partner Left Banner */}
      {!partnerLeft ? (
        <div className="chat-input">
          <input
            className="chat-input__field"
            value={message}
            onChange={(e) => { setMessage(e.target.value); socket.emit('typing', roomId); }}
            onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } }}
            placeholder={!partnerOnline ? `${partner?.name} disconnected...` : "Type a message..."}
            disabled={!partnerOnline}
          />
          <button className="chat-input__send-btn" onClick={sendMessage} disabled={!partnerOnline || !message.trim()}>➤</button>
        </div>
      ) : (
        <div className="partner-left-banner">
          <div className="partner-left-banner__icon">👋</div>
          <p className="partner-left-banner__title">{partner?.name} has left</p>
          <p className="partner-left-banner__text">You can still read the conversation.</p>
          <button className="partner-left-banner__btn" onClick={leave}>Find new partner</button>
        </div>
      )}
    </div>
  );
}