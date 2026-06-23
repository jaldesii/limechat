import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../services/socket";
import "./ChatRoom.scss";

// ✅ SVG Icons
function ReplyIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>);}
function SendIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);}
function SpacingIcon({ compact }) { return compact ? (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="18" x2="16" y2="18" /></svg>) : (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="14" x2="16" y2="14" /></svg>);}
function HeartIcon({ filled }) { return filled ? (<svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>) : null;}
function ChatIcon() { return (<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);}
function AnnounceIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);}
function WaveIcon() { return (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V9a5 5 0 0 1 10 0v2" /><path d="M17 11v3a5 5 0 0 1-10 0v-3" /><line x1="12" y1="19" x2="12" y2="22" /></svg>);}
function CloseIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);}
function ScrollDownIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>);}
function TimerIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);}
function AdminBadgeIcon() { return (<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>);}
function MembersIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);}

function AnnouncementTimer({ expiresAt }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => { const update = () => { const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000); if (diff <= 0) { setRemaining(''); return; } const m = Math.floor(diff / 60); const s = diff % 60; setRemaining(m > 0 ? `${m}m ${s}s` : `${s}s`); }; update(); const interval = setInterval(update, 1000); return () => clearInterval(interval); }, [expiresAt]);
  if (!remaining) return null;
  return (<span className="chat-announcement__timer"><TimerIcon />{remaining}</span>);
}
function Confetti({ active }) { if (!active) return null; const particles = Array.from({ length: 50 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 2, color: ['#84cc16', '#a3e635', '#65a30d', '#fbbf24', '#ecfccb'][Math.floor(Math.random() * 5)], size: Math.random() * 8 + 4 })); return (<div className="confetti-container">{particles.map(p => (<div key={p.id} className="confetti-particle" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, background: p.color, width: `${p.size}px`, height: `${p.size}px` }} />))}</div>); }
function Linkify({ text }) { const urlRegex = /(https?:\/\/[^\s]+)/g; const parts = text.split(urlRegex); return parts.map((part, i) => { if (part.match(urlRegex)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="message__link">{part}</a>; return part; }); }

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
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [reactions, setReactions] = useState({});
  const [spacing, setSpacing] = useState(localStorage.getItem('msgSpacing') || 'comfortable');
  const [chatStartTime] = useState(Date.now());
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyTarget, setReplyTarget] = useState(null);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const hasLeftRef = useRef(false);
  const lastTapRef = useRef(0);
  const sendingRef = useRef(false);
  const messagesRef = useRef(messages);
  const lastTypingEmitRef = useRef(0);
  
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  
  // ============================================
  // ✅ INSTANT AUTO-RESIZE TEXTAREA (No delay on shrink)
  // ============================================
// ============================================
// ✅ INSTANT AUTO-RESIZE — Guaranteed shrink
// ============================================
const resizeTextarea = useCallback(() => {
  const ta = textareaRef.current;
  if (!ta) return;

  // Step 1: Force height to auto temporarily so scrollHeight becomes accurate
  ta.style.height = 'auto';
  ta.style.overflowY = 'hidden';
  
  // Step 2: Let browser recalculate
  const scrollH = ta.scrollHeight;
  
  // Step 3: Set final height with limits
  const newH = Math.min(Math.max(scrollH, 44), 120);
  ta.style.height = newH + 'px';
  
  // Step 4: Only show scrollbar if content exceeds max
  ta.style.overflowY = scrollH > 120 ? 'auto' : 'hidden';
}, []);

// Trigger resize
useEffect(() => {
  resizeTextarea();
}, [message, resizeTextarea]);

// Handle window resize
useEffect(() => {
  window.addEventListener('resize', resizeTextarea);
  return () => window.removeEventListener('resize', resizeTextarea);
}, [resizeTextarea]);

  // Handle window resize (mobile rotate / desktop resize)
  useEffect(() => {
    const onResize = () => resizeTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeTextarea]);
  
  const updateFavicon = useCallback((hasUnread) => { const f = document.querySelector("link[rel='icon']"); if (!f) return; if (hasUnread) { const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#84cc16'; x.beginPath(); x.roundRect(0, 0, 32, 32, 8); x.fill(); x.fillStyle = '#ef4444'; x.beginPath(); x.arc(26, 6, 6, 0, Math.PI * 2); x.fill(); f.href = c.toDataURL(); } else { f.href = '/icon.png'; } }, []);
  
  const showNotification = useCallback((sn, txt) => { if (document.hidden && Notification.permission === 'granted') { new Notification(`${sn} - LimeChat`, { body: txt, icon: '/icon.png', badge: '/icon.png', tag: 'limechat-message' }); setUnreadCount(prev => { const n = prev + 1; updateFavicon(true); document.title = `(${n}) LimeChat`; return n; }); } }, [updateFavicon]);
  
  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, []);
  useEffect(() => { const h = () => { setUnreadCount(0); updateFavicon(false); document.title = 'LimeChat'; }; window.addEventListener('focus', h); return () => window.removeEventListener('focus', h); }, [updateFavicon]);
  
  const checkIfAtBottom = useCallback(() => { const c = messagesContainerRef.current; if (!c) return; const b = c.scrollHeight - c.scrollTop - c.clientHeight < 100; setAutoScroll(b); setShowScrollBtn(!b && messages.length > 0); }, [messages.length]);
  const scrollToBottom = (s = true) => { messagesEndRef.current?.scrollIntoView({ behavior: s ? "smooth" : "auto" }); setAutoScroll(true); setShowScrollBtn(false); };
  const handleReply = (msg) => { setReplyTarget({ text: msg.text, senderName: msg.senderName === 'You' ? myInfo?.name : partner?.name }); textareaRef.current?.focus(); };
  const cancelReply = () => setReplyTarget(null);
  const handleMessageDoubleClick = (i) => { const n = Date.now(); if (n - lastTapRef.current < 400) { const m = messagesRef.current[i]; if (!m || m.type !== 'message') return; const nr = reactions[i] === '❤️' ? null : '❤️'; setReactions(prev => ({ ...prev, [i]: nr })); socket.emit('messageReaction', { roomId, messageIndex: i, messageText: m.text, messageTimestamp: m.timestamp, reaction: nr, senderName: myInfo?.name }); } lastTapRef.current = n; };
  const toggleSpacing = () => { const n = spacing === 'comfortable' ? 'compact' : 'comfortable'; setSpacing(n); localStorage.setItem('msgSpacing', n); };
  const getChatSummary = () => { const d = Math.floor((Date.now() - chatStartTime) / 1000); const my = messages.filter(m => m.type === 'message' && m.senderName === 'You').length; const pt = messages.filter(m => m.type === 'message' && m.senderName !== 'You').length; return { duration: `${Math.floor(d/60)}m ${d%60}s`, myMsgs: my, partnerMsgs: pt, total: messages.filter(m => m.type === 'message').length }; };

  // ✅ Smart typing indicator - only emit every 2 seconds max
  const handleTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      socket.emit('typing', roomId);
      lastTypingEmitRef.current = now;
    }
  }, [roomId]);

  useEffect(() => { 
    const us = localStorage.getItem('user'), ps = localStorage.getItem('partner'); 
    if (!us || !ps) { navigate('/profile'); return; } 
    const user = JSON.parse(us), partnerData = JSON.parse(ps); 
    setMyInfo(user); setPartner(partnerData); 
    socket.emit('joinRoom', roomId); 
    setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000);
    
    const isGroup = sessionStorage.getItem('isGroupChat') === 'true';
    if (isGroup) { 
      setIsGroupChat(true); 
      sessionStorage.removeItem('isGroupChat');
      socket.emit('getGroupMembers', { roomId });
    }
    
    const events = ['receiveMessage','partnerTyping','partnerDisconnected','partnerReconnected','partnerLeft','partnerJoined','announcement','clearAnnouncement','messageReaction','groupUserList','groupUserJoined','groupUserLeft','groupJoined']; 
    events.forEach(e => socket.off(e)); 
    
    socket.on('receiveMessage', (data) => { 
      if (data.sender === socket.id) return; 
      setMessages(prev => { 
        if (prev.find(m => m.type==='message' && m.text===data.message && m.senderName===data.senderName && Math.abs(new Date(m.timestamp)-new Date(data.timestamp))<2000)) return prev; 
        return [...prev, { type:'message', text:data.message, sender:data.sender, senderName:data.senderName, timestamp:data.timestamp, replyTo:data.replyTo||null, isQuoted:!!data.replyTo }]; 
      }); 
      showNotification(data.senderName, data.message); 
    }); 
    
    socket.on('partnerTyping', () => { setPartnerTyping(true); clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 2000); }); 
    socket.on('partnerDisconnected', () => { setPartnerOnline(false); setConnectionStatus("disconnected"); setMessages(prev => [...prev, { type:'system', text:`${partnerData?.name||'Partner'} disconnected`, timestamp:new Date().toISOString() }]); }); 
    socket.on('partnerReconnected', () => { setPartnerOnline(true); setConnectionStatus("connected"); setMessages(prev => [...prev, { type:'system', text:`${partnerData?.name||'Partner'} is back`, timestamp:new Date().toISOString() }]); }); 
    socket.on('partnerLeft', (data) => { setPartnerOnline(false); setPartnerLeft(true); setConnectionStatus("left"); const pn = data?.partnerName || partnerData?.name || 'Partner'; setMessages(prev => { if (prev[prev.length-1]?.type==='system' && prev[prev.length-1].text.includes('left')) return prev; return [...prev, { type:'system', text:`${pn} left`, timestamp:new Date().toISOString() }]; }); }); 
    socket.on('partnerJoined', () => { setConnectionStatus("connected"); setMessages(prev => { if (prev.some(m=>m.type==='system'&&m.text.includes('joined'))) return prev; return [...prev, { type:'system', text:`${partnerData?.name||'Partner'} joined`, timestamp:new Date().toISOString() }]; }); }); 
    socket.on('messageReaction', (data) => { const latest = messagesRef.current; const idx = latest.findIndex(m => m.type==='message' && m.text===data.messageText && Math.abs(new Date(m.timestamp)-new Date(data.messageTimestamp))<5000); if (idx >= 0) setReactions(prev => ({ ...prev, [idx]: data.reaction || null })); }); 
    
    socket.on('groupJoined', (data) => { setIsGroupChat(true); socket.emit('getGroupMembers', { roomId: data.roomId }); });
    socket.on('groupUserList', (data) => { if (data.roomId === roomId) { setGroupMembers(data.members || []); setIsGroupChat(true); } });
    socket.on('groupUserJoined', (data) => { if (data.roomId === roomId) { setGroupMembers(prev => { if (prev.find(m => m.socketId === data.user.socketId)) return prev; return [...prev, data.user]; }); } });
    socket.on('groupUserLeft', (data) => { if (data.roomId === roomId) { setGroupMembers(prev => prev.filter(m => m.socketId !== data.socketId)); } });
    socket.on('announcement', (data) => setAnnouncement(data)); 
    socket.on('clearAnnouncement', () => setAnnouncement(null)); 
    
    window.history.pushState(null, '', window.location.href); 
    const pop = () => { window.history.pushState(null, '', window.location.href); if (!hasLeftRef.current) setShowLeaveModal(true); }; 
    const unload = (e) => { if (!hasLeftRef.current) { e.preventDefault(); e.returnValue = ''; } }; 
    const keydown = (e) => { if (!hasLeftRef.current && (e.key==='F5'||(e.ctrlKey&&e.key==='r'))) { e.preventDefault(); setShowLeaveModal(true); } }; 
    window.addEventListener('popstate', pop); window.addEventListener('beforeunload', unload); window.addEventListener('keydown', keydown); 
    scrollToBottom(false); 
    
    return () => { 
      events.forEach(e => socket.off(e)); 
      window.removeEventListener('popstate', pop); 
      window.removeEventListener('beforeunload', unload); 
      window.removeEventListener('keydown', keydown); 
    }; 
  }, [roomId, navigate, showNotification]);
  
  useEffect(() => { const c = messagesContainerRef.current; if (!c) return; const h = () => checkIfAtBottom(); c.addEventListener('scroll', h); return () => c.removeEventListener('scroll', h); }, [checkIfAtBottom]);
  useEffect(() => { if (autoScroll) scrollToBottom(true); }, [messages, autoScroll]);
  useEffect(() => { const c = messagesContainerRef.current; if (!c) return; let sx = 0, sy = 0; const ts = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }; const te = (e) => { const dx = e.changedTouches[0].clientX - sx; const dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { const t = e.target.closest('.message'); if (t) { const all = document.querySelectorAll('.chat-messages .message'); const idx = Array.from(all).indexOf(t); const lm = messagesRef.current; if (idx >= 0 && lm[idx]?.type === 'message') handleReply(lm[idx]); } } }; c.addEventListener('touchstart', ts, { passive: true }); c.addEventListener('touchend', te, { passive: true }); return () => { c.removeEventListener('touchstart', ts); c.removeEventListener('touchend', te); }; }, []);

  const sendMessage = () => { 
    if (!message.trim() || !partnerOnline || sendingRef.current) return; 
    sendingRef.current = true; 
    socket.emit('sendMessage', { roomId, message, sender:socket.id, senderName:myInfo.name, timestamp:new Date().toISOString(), replyTo:replyTarget||null }); 
    setMessages(prev => [...prev, { type:'message', text:message, sender:socket.id, senderName:"You", timestamp:new Date().toISOString(), replyTo:replyTarget||null, isQuoted:!!replyTarget }]); 
    setMessage(""); 
    setReplyTarget(null); 
    setAutoScroll(true); 
    // ✅ Reset textarea height instantly after send
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
    setIsInputFocused(false);
    setTimeout(() => { sendingRef.current = false; }, 500); 
  };
  
  const skip = () => { if (hasLeftRef.current) return; hasLeftRef.current = true; socket.emit('leaveRoom', { roomId, partnerName:myInfo?.name }); localStorage.removeItem('partner'); localStorage.removeItem('roomId'); navigate('/waiting', { replace:true }); };
  const leave = () => { if (hasLeftRef.current) return; hasLeftRef.current = true; socket.emit('leaveRoom', { roomId, partnerName:myInfo?.name }); localStorage.removeItem('partner'); localStorage.removeItem('roomId'); navigate('/profile', { replace:true }); };
  const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const init = (n) => (n || '?')[0].toUpperCase();
  const summary = getChatSummary();

  return (
    <div className="chat-room">
      <Confetti active={showConfetti} />
      
      {showLeaveModal && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <p className="leave-modal__text">You're chatting with <strong>{partner?.name}</strong></p>
            <div className="leave-modal__warning"><p>If you leave, {partner?.name} will be notified.</p></div>
            <div className="leave-modal__actions">
              <button className="leave-modal__btn leave-modal__btn--stay" onClick={()=>{setShowLeaveModal(false);window.history.pushState(null,'',window.location.href)}}>Stay</button>
              <button className="leave-modal__btn leave-modal__btn--leave" onClick={leave}>Leave</button>
            </div>
          </div>
        </div>
      )}
      
      {showSkipModal && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <p className="leave-modal__text">Skip this conversation?</p>
            <div className="leave-modal__warning"><p>You'll be matched with someone new.</p></div>
            <div className="leave-modal__actions">
              <button className="leave-modal__btn leave-modal__btn--stay" onClick={()=>{setShowSkipModal(false);window.history.pushState(null,'',window.location.href)}}>Stay</button>
              <button className="leave-modal__btn leave-modal__btn--skip" onClick={skip}>Skip & Find New</button>
            </div>
          </div>
        </div>
      )}
      
      <div className="chat-header">
        <div className="chat-header__partner-info">
          <div className="chat-header__avatar">{init(partner?.name)}</div>
          <div className="chat-header__details">
            <p className="chat-header__name">
              <span className={`chat-header__status chat-header__status--${connectionStatus}`} />
              {isGroupChat ? `Group Chat` : partner?.name||'Unknown'}
            </p>
            <p className="chat-header__location">
              {isGroupChat ? `${groupMembers.length} members` : partner?.location||''}
            </p>
          </div>
        </div>
        <div className="chat-header__actions">
          {isGroupChat && (
            <button className="chat-header__members-btn" onClick={() => setShowMembersPanel(!showMembersPanel)}>
              <MembersIcon /> {groupMembers.length}
            </button>
          )}
          <button className="chat-header__spacing-btn" onClick={toggleSpacing}>
            <SpacingIcon compact={spacing==='compact'} />
          </button>
          {!partnerLeft && (
            <>
              <button className="chat-header__skip-btn" onClick={()=>setShowSkipModal(true)}>Skip</button>
              <button className="chat-header__leave-btn" onClick={()=>setShowLeaveModal(true)}>Leave</button>
            </>
          )}
        </div>
      </div>
      
      {announcement && (
        <div className="chat-announcement">
          <span className="chat-announcement__icon"><AnnounceIcon /></span>
          <span className="chat-announcement__text">{announcement.text}</span>
          {announcement.duration>0 && announcement.expiresAt && <AnnouncementTimer expiresAt={announcement.expiresAt} />}
          {announcement.duration===0 && <span className="chat-announcement__badge"><AdminBadgeIcon /> Admin</span>}
        </div>
      )}
      
      <div className="chat-main-area">
        <div className={`chat-messages chat-messages--${spacing}`} ref={messagesContainerRef}>
          {showScrollBtn && (
            <button className="scroll-to-bottom" onClick={()=>scrollToBottom(true)}>
              <ScrollDownIcon /> New messages
            </button>
          )}
          
          {messages.length===0 && !partnerLeft && (
            <div className="chat-messages__empty">
              <div className="chat-messages__empty-icon"><ChatIcon /></div>
              <p className="chat-messages__empty-text">Start chatting with {isGroupChat ? 'the group' : partner?.name}</p>
              <p className="chat-messages__empty-subtext">Send a message to begin</p>
            </div>
          )}
          
          {messages.map((msg,i)=> (
            <div key={i}>
              {msg.type==='system' ? (
                <div className="system-message"><span className="system-message__text">{msg.text}</span></div>
              ) : (
                <div className={`message ${msg.senderName==="You"?'message--sent':'message--received'} ${msg.isQuoted?'message--quoted':''}`} onClick={()=>handleMessageDoubleClick(i)}>
                  {msg.replyTo && (
                    <div className="message__reply-preview">
                      <span className="message__reply-name">{msg.replyTo.senderName}</span>
                      <span className="message__reply-text">{msg.replyTo.text.slice(0,50)}{msg.replyTo.text.length>50?'...':''}</span>
                    </div>
                  )}
                  <span className="message__sender">{msg.senderName==="You"?'You':msg.senderName}</span>
                  <div className={`message__bubble ${msg.senderName==="You"?'message__bubble--sent':'message__bubble--received'}`}><Linkify text={msg.text}/></div>
                  {reactions[i] && <span className="message__reaction"><HeartIcon filled /></span>}
                  <div className="message__actions">
                    <button className="message__reply-btn" onClick={(e)=>{e.stopPropagation();handleReply(msg)}}><ReplyIcon /></button>
                    <span className="message__tooltip">Reply</span>
                  </div>
                  <span className="message__time">{fmt(msg.timestamp)}</span>
                </div>
              )}
            </div>
          ))}
          
          {replyTarget && (
            <div className="chat-reply-indicator">
              <div className="chat-reply-indicator__content">
                <span className="chat-reply-indicator__label">Replying to {replyTarget.senderName}</span>
                <span className="chat-reply-indicator__text">{replyTarget.text.slice(0,40)}</span>
              </div>
              <button className="chat-reply-indicator__cancel" onClick={cancelReply}><CloseIcon /></button>
            </div>
          )}
          
          {partnerTyping && partnerOnline && (
            <div className="typing-indicator">
              <div className="typing-indicator__dots"><span/><span/><span/></div>
              {partner?.name} typing...
            </div>
          )}
          <div ref={messagesEndRef}/>
        </div>
        
        {isGroupChat && showMembersPanel && (
          <div className="chat-members-panel">
            <div className="chat-members-panel__header">
              <h3>Members ({groupMembers.length})</h3>
              <button className="chat-members-panel__close" onClick={() => setShowMembersPanel(false)}><CloseIcon /></button>
            </div>
            <div className="chat-members-panel__list">
              {groupMembers.map((m, i) => (
                <div key={m.socketId || i} className="chat-members-panel__member">
                  <div className="chat-members-panel__avatar" style={{ background: m.socketId === socket.id ? '#84cc16' : '#ecfccb', color: m.socketId === socket.id ? '#09090b' : '#65a30d' }}>{(m.name || '?')[0].toUpperCase()}</div>
                  <div className="chat-members-panel__info">
                    <span className="chat-members-panel__name">{m.name} {m.socketId === socket.id ? '(You)' : ''}</span>
                    <span className="chat-members-panel__location">📍 {m.location || 'Unknown'}</span>
                  </div>
                  <div className="chat-members-panel__dot" style={{ background: m.online ? '#84cc16' : '#d4d4d8' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {!partnerLeft && (
        <div className="chat-bottom-bar">
          <button className="chat-bottom-bar__btn chat-bottom-bar__btn--skip" onClick={()=>setShowSkipModal(true)}>Skip</button>
          <button className="chat-bottom-bar__btn chat-bottom-bar__btn--leave" onClick={()=>setShowLeaveModal(true)}>Leave</button>
        </div>
      )}

      {/* ✅ SMART INPUT AREA */}
      {!partnerLeft ? (
        <div className={`chat-input ${isInputFocused ? 'chat-input--focused' : ''} ${message.trim() ? 'chat-input--has-text' : ''}`}>
          <div className="chat-input__wrapper">
            <textarea 
              ref={textareaRef} 
              className="chat-input__field" 
              value={message} 
              onChange={(e) => { 
                setMessage(e.target.value); 
                handleTyping();
              }} 
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                  e.preventDefault(); 
                  sendMessage(); 
                } 
              }} 
              placeholder={!partnerOnline ? `${partner?.name} disconnected...` : "Type a message..."} 
              disabled={!partnerOnline} 
              rows={1} 
            />
            <button 
              className={`chat-input__send-btn ${message.trim() ? 'chat-input__send-btn--active' : ''}`}
              onClick={sendMessage} 
              disabled={!partnerOnline || !message.trim()}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      ) : (
        <div className="partner-left-banner">
          <div className="partner-left-banner__icon"><WaveIcon /></div>
          <p className="partner-left-banner__title">{partner?.name} has left</p>
          <p className="partner-left-banner__text">You can still read the conversation.</p>
          <div className="chat-summary">
            <div className="chat-summary__item"><span className="chat-summary__value">{summary.duration}</span><span className="chat-summary__label">Duration</span></div>
            <div className="chat-summary__item"><span className="chat-summary__value">{summary.total}</span><span className="chat-summary__label">Messages</span></div>
            <div className="chat-summary__item"><span className="chat-summary__value">{summary.myMsgs}</span><span className="chat-summary__label">You</span></div>
            <div className="chat-summary__item"><span className="chat-summary__value">{summary.partnerMsgs}</span><span className="chat-summary__label">{partner?.name}</span></div>
          </div>
          <div className="partner-left-banner__actions">
            <button className="partner-left-banner__btn partner-left-banner__btn--skip" onClick={skip}>Find New Partner</button>
            <button className="partner-left-banner__btn partner-left-banner__btn--leave" onClick={leave}>Back to Profile</button>
          </div>
        </div>
      )}
    </div>
  );
}