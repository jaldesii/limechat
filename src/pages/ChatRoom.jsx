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
function EditIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);}
function DeleteIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);}

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
  const [editingMessage, setEditingMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [showGroupNameEdit, setShowGroupNameEdit] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [expandedMessages, setExpandedMessages] = useState({});
  const contextMenuRef = useRef(null);
  const textareaRef = useRef(null);
  const editTextareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const hasLeftRef = useRef(false);
  const lastTapRef = useRef(0);
  const sendingRef = useRef(false);
  const messagesRef = useRef(messages);
  const lastTypingEmitRef = useRef(0);
  
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { const t = setTimeout(() => setIsLoading(false), 800); return () => clearTimeout(t); }, []);
  useEffect(() => { const h = () => setContextMenu(null); if (contextMenu) { document.addEventListener('click', h); return () => document.removeEventListener('click', h); } }, [contextMenu]);

  // ✅ Add/remove announcement class on body
  useEffect(() => {
    if (announcement) {
      document.body.classList.add('has-announcement');
    } else {
      document.body.classList.remove('has-announcement');
    }
    return () => {
      document.body.classList.remove('has-announcement');
    };
  }, [announcement]);

  const resizeTextarea = useCallback(() => { const ta = textareaRef.current; if (!ta) return; ta.style.height = 'auto'; ta.style.overflowY = 'hidden'; const nh = Math.min(Math.max(ta.scrollHeight, 44), 120); ta.style.height = nh + 'px'; ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden'; }, []);
  useEffect(() => { resizeTextarea(); }, [message, resizeTextarea]);

  // ✅ Auto-resize the edit textarea
  const resizeEditTextarea = useCallback(() => { const ta = editTextareaRef.current; if (!ta) return; ta.style.height = 'auto'; const nh = Math.min(Math.max(ta.scrollHeight, 36), 200); ta.style.height = nh + 'px'; ta.style.overflowY = ta.scrollHeight > 200 ? 'auto' : 'hidden'; }, []);
  useEffect(() => { if (editingMessage) resizeEditTextarea(); }, [editingMessage, resizeEditTextarea]);

  const updateFavicon = useCallback((hu) => { const f = document.querySelector("link[rel='icon']"); if (!f) return; if (hu) { const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#84cc16'; x.beginPath(); x.roundRect(0, 0, 32, 32, 8); x.fill(); x.fillStyle = '#ef4444'; x.beginPath(); x.arc(26, 6, 6, 0, Math.PI * 2); x.fill(); f.href = c.toDataURL(); } else { f.href = '/icon.png'; } }, []);
  const showNotification = useCallback((sn, txt) => { if (document.hidden && Notification.permission === 'granted') { new Notification(`${sn} - LimeChat`, { body: txt, icon: '/icon.png', badge: '/icon.png', tag: 'limechat-message' }); setUnreadCount(p => { const n = p + 1; updateFavicon(true); document.title = `(${n}) LimeChat`; return n; }); } }, [updateFavicon]);
  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, []);
  useEffect(() => { const h = () => { setUnreadCount(0); updateFavicon(false); document.title = 'LimeChat'; }; window.addEventListener('focus', h); return () => window.removeEventListener('focus', h); }, [updateFavicon]);
  const checkIfAtBottom = useCallback(() => { const c = messagesContainerRef.current; if (!c) return; const b = c.scrollHeight - c.scrollTop - c.clientHeight < 100; setAutoScroll(b); setShowScrollBtn(!b && messages.length > 0); }, [messages.length]);
  const scrollToBottom = (s = true) => { messagesEndRef.current?.scrollIntoView({ behavior: s ? "smooth" : "auto" }); setAutoScroll(true); setShowScrollBtn(false); };
  const handleReply = (msg) => { setReplyTarget({ text: msg.text, senderName: msg.senderName === 'You' ? myInfo?.name : partner?.name }); textareaRef.current?.focus(); };
  const cancelReply = () => setReplyTarget(null);
  const handleInputChange = (e) => { const v = e.target.value; setMessage(v); if (isGroupChat && v.endsWith('@')) setShowMembersPanel(true); };
  const mentionUser = (mn) => { setMessage(p => p.replace(/@$/, `@${mn} `)); setShowMembersPanel(false); textareaRef.current?.focus(); };
  const handleMessageDoubleClick = (i) => { const n = Date.now(); if (n - lastTapRef.current < 400) { const m = messagesRef.current[i]; if (!m || m.type !== 'message') return; const nr = reactions[i] === '❤️' ? null : '❤️'; setReactions(p => ({ ...p, [i]: nr })); socket.emit('messageReaction', { roomId, messageIndex: i, messageText: m.text, messageTimestamp: m.timestamp, reaction: nr, senderName: myInfo?.name }); } lastTapRef.current = n; };
  
  const handleEditMessage = (index) => { const msg = messages[index]; if (msg.senderName !== 'You') return; setEditingMessage({ index, text: msg.text, messageId: msg.messageId }); };
  const saveEditedMessage = () => { if (!editingMessage?.text?.trim()) return; socket.emit('editMessage', { roomId, messageId: editingMessage.messageId, newText: editingMessage.text }); setMessages(prev => prev.map((m, i) => i === editingMessage.index ? { ...m, text: editingMessage.text, edited: true } : m)); setEditingMessage(null); };
  const handleDeleteMessage = (index) => { const msg = messages[index]; if (msg.senderName !== 'You') return; setConfirmModal({ message: 'Delete this message?', onConfirm: () => { socket.emit('deleteMessage', { roomId, messageId: msg.messageId }); setMessages(prev => prev.filter((_, i) => i !== index)); setConfirmModal(null); } }); };
  const handleEditGroupName = () => { if (!groupName.trim()) return; socket.emit('editGroupName', { roomId, name: groupName }); setShowGroupNameEdit(false); };
  const toggleSpacing = () => { const n = spacing === 'comfortable' ? 'compact' : 'comfortable'; setSpacing(n); localStorage.setItem('msgSpacing', n); };
  const getChatSummary = () => { const d = Math.floor((Date.now() - chatStartTime) / 1000); const my = messages.filter(m => m.type === 'message' && m.senderName === 'You').length; const pt = messages.filter(m => m.type === 'message' && m.senderName !== 'You').length; return { duration: `${Math.floor(d/60)}m ${d%60}s`, myMsgs: my, partnerMsgs: pt, total: messages.filter(m => m.type === 'message').length }; };

  const handleTouchStart = useCallback((e, i) => { const msg = messagesRef.current[i]; if (!msg || msg.type !== 'message') return; e.preventDefault(); const timer = setTimeout(() => { const touch = e.touches[0]; setContextMenu({ index: i, x: touch.clientX, y: touch.clientY, isOwn: msg.senderName === 'You' }); if (navigator.vibrate) navigator.vibrate(15); }, 600); e.target._longPressTimer = timer; }, []);
  const handleTouchEnd = useCallback((e) => { if (e.target._longPressTimer) { clearTimeout(e.target._longPressTimer); e.target._longPressTimer = null; } }, []);
  const handleTouchMove = useCallback((e) => { if (e.target._longPressTimer) { clearTimeout(e.target._longPressTimer); e.target._longPressTimer = null; } }, []);
  const handleContextReply = () => { if (contextMenu) { handleReply(messagesRef.current[contextMenu.index]); setContextMenu(null); } };
  const handleContextEdit = () => { if (contextMenu?.isOwn) { handleEditMessage(contextMenu.index); setContextMenu(null); } };
  const handleContextDelete = () => { if (contextMenu?.isOwn) { handleDeleteMessage(contextMenu.index); setContextMenu(null); } };
  const handleContextReact = () => { if (contextMenu) { handleMessageDoubleClick(contextMenu.index); setContextMenu(null); } };

  useEffect(() => { 
    const us = localStorage.getItem('user'), ps = localStorage.getItem('partner'); 
    if (!us || !ps) { navigate('/profile'); return; } 
    const user = JSON.parse(us), partnerData = JSON.parse(ps); 
    setMyInfo(user); setPartner(partnerData); 
    
    // ✅ Set up announcement listeners BEFORE joining room
    socket.off('announcement');
    socket.off('clearAnnouncement');
    
    socket.on('announcement', (d) => {
      console.log('📢 Announcement received in chat:', d);
      setAnnouncement(d);
    });
    
    socket.on('clearAnnouncement', () => {
      console.log('🗑️ Announcement cleared in chat');
      setAnnouncement(null);
    });
    
    socket.emit('joinRoom', roomId); 
    setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000);
    const ig = sessionStorage.getItem('isGroupChat') === 'true';
    if (ig) { setIsGroupChat(true); sessionStorage.removeItem('isGroupChat'); socket.emit('getGroupMembers', { roomId }); }
    
    const events = ['receiveMessage','partnerTyping','partnerDisconnected','partnerReconnected','partnerLeft','partnerJoined','messageReaction','groupUserList','groupUserJoined','groupUserLeft','groupJoined','messageEdited','messageDeleted','groupNameUpdated','spamWarning']; 
    events.forEach(e => socket.off(e)); 
    
    socket.on('receiveMessage', (d) => { setMessages(p => { if (p.find(m => m.messageId === d.messageId)) return p; const isMine = d.sender === socket.id; return [...p, { type:'message', text:d.message, sender:d.sender, senderName:isMine?'You':d.senderName, timestamp:d.timestamp, replyTo:d.replyTo||null, isQuoted:!!d.replyTo, messageId:d.messageId }]; }); if (d.sender !== socket.id) showNotification(d.senderName, d.message); });
    socket.on('spamWarning', (msg) => { setToast({ message: '⚠️ ' + msg, type: 'warning' }); setTimeout(() => setToast(null), 3000); });
    socket.on('partnerTyping', () => { setPartnerTyping(true); clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 2000); }); 
    socket.on('partnerDisconnected', () => { setPartnerOnline(false); setConnectionStatus("disconnected"); setMessages(p => [...p, { type:'system', text:`${partnerData?.name||'Partner'} disconnected`, timestamp:new Date().toISOString() }]); }); 
    socket.on('partnerReconnected', () => { setPartnerOnline(true); setConnectionStatus("connected"); setMessages(p => [...p, { type:'system', text:`${partnerData?.name||'Partner'} is back`, timestamp:new Date().toISOString() }]); }); 
    socket.on('partnerLeft', (d) => { setPartnerOnline(false); setPartnerLeft(true); setConnectionStatus("left"); const pn = d?.partnerName || partnerData?.name || 'Partner'; setMessages(p => { if (p[p.length-1]?.type==='system' && p[p.length-1].text.includes('left')) return p; return [...p, { type:'system', text:`${pn} left`, timestamp:new Date().toISOString() }]; }); }); 
    socket.on('partnerJoined', () => { setConnectionStatus("connected"); setMessages(p => { if (p.some(m=>m.type==='system'&&m.text.includes('joined'))) return p; return [...p, { type:'system', text:`${partnerData?.name||'Partner'} joined`, timestamp:new Date().toISOString() }]; }); }); 
    socket.on('messageReaction', (d) => { const l = messagesRef.current; const idx = l.findIndex(m => m.type==='message' && m.text===d.messageText && Math.abs(new Date(m.timestamp)-new Date(d.messageTimestamp))<5000); if (idx >= 0) setReactions(p => ({ ...p, [idx]: d.reaction || null })); }); 
    socket.on('groupJoined', (d) => { setIsGroupChat(true); socket.emit('getGroupMembers', { roomId: d.roomId }); });
    socket.on('groupUserList', (d) => { if (d.roomId === roomId) { setGroupMembers(d.members || []); setIsGroupChat(true); } });
    socket.on('groupUserJoined', (d) => { if (d.roomId === roomId) { setGroupMembers(p => { if (p.find(m => m.socketId === d.user.socketId)) return p; return [...p, d.user]; }); } });
    socket.on('groupUserLeft', (d) => { if (d.roomId === roomId) { setGroupMembers(p => p.filter(m => m.socketId !== d.socketId)); } });
    socket.on('messageEdited', (d) => { setMessages(p => p.map(m => m.messageId === d.messageId ? { ...m, text: d.newText, edited: true } : m)); });
    socket.on('messageDeleted', (d) => { setMessages(p => p.filter(m => m.messageId !== d.messageId)); });
    socket.on('groupNameUpdated', (d) => { if (d.roomId === roomId) { setGroupName(d.name); setPartner(p => ({ ...p, name: d.name })); } });
    
    window.history.pushState(null, '', window.location.href); 
    const pop = () => { window.history.pushState(null, '', window.location.href); if (!hasLeftRef.current) setShowLeaveModal(true); }; 
    const unload = (e) => { if (!hasLeftRef.current) { e.preventDefault(); e.returnValue = ''; } }; 
    const kd = (e) => { if (!hasLeftRef.current && (e.key==='F5'||(e.ctrlKey&&e.key==='r'))) { e.preventDefault(); setShowLeaveModal(true); } }; 
    window.addEventListener('popstate', pop); window.addEventListener('beforeunload', unload); window.addEventListener('keydown', kd); 
    scrollToBottom(false); 
    return () => { 
      events.forEach(e => socket.off(e)); 
      socket.off('announcement');
      socket.off('clearAnnouncement');
      window.removeEventListener('popstate', pop); 
      window.removeEventListener('beforeunload', unload); 
      window.removeEventListener('keydown', kd); 
    }; 
  }, [roomId, navigate, showNotification]);
  
  useEffect(() => { const c = messagesContainerRef.current; if (!c) return; const h = () => { checkIfAtBottom(); setContextMenu(null); }; c.addEventListener('scroll', h); return () => c.removeEventListener('scroll', h); }, [checkIfAtBottom]);
  useEffect(() => { if (autoScroll) scrollToBottom(true); }, [messages, autoScroll]);

  const sendMessage = () => { if (!message.trim() || !partnerOnline || sendingRef.current) return; sendingRef.current = true; const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); socket.emit('sendMessage', { roomId, message, sender:socket.id, senderName:myInfo.name, timestamp:new Date().toISOString(), replyTo:replyTarget||null, messageId }); setMessage(""); setReplyTarget(null); setAutoScroll(true); if (textareaRef.current) textareaRef.current.style.height = '44px'; setIsInputFocused(false); setTimeout(() => { sendingRef.current = false; }, 500); };
  const skip = () => { if (hasLeftRef.current) return; hasLeftRef.current = true; socket.emit('leaveRoom', { roomId, partnerName:myInfo?.name }); localStorage.removeItem('partner'); localStorage.removeItem('roomId'); navigate('/waiting', { replace:true }); };
  const leave = () => { if (hasLeftRef.current) return; hasLeftRef.current = true; socket.emit('leaveRoom', { roomId, partnerName:myInfo?.name }); localStorage.removeItem('partner'); localStorage.removeItem('roomId'); navigate('/profile', { replace:true }); };
  const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const init = (n) => (n || '?')[0].toUpperCase();
  const summary = getChatSummary();

  if (isLoading) return (<div className="chat-room"><div className="chat-header"><div className="chat-header__partner-info"><div className="chat-header__avatar skeleton-pulse" /><div className="chat-header__details"><div className="skeleton-line skeleton-line--name" /><div className="skeleton-line skeleton-line--location" /></div></div></div><div className="chat-messages">{[1,2,3,4].map(i => (<div key={i} className={`message ${i%2===0?'message--sent':'message--received'}`}><div className="skeleton-line skeleton-line--sender" /><div className={`skeleton-bubble ${i%2===0?'skeleton-bubble--sent':'skeleton-bubble--received'}`} /></div>))}</div><div className="chat-input"><div className="chat-input__wrapper"><div className="chat-input__field skeleton-pulse" /><div className="chat-input__send-btn skeleton-pulse" /></div></div></div>);

  return (
    <>
      {/* ✅ GLOBAL ANNOUNCEMENT - Outside chat container, fixed at top */}
      {announcement && (
        <div className="chat-announcement">
          <span className="chat-announcement__icon"><AnnounceIcon/></span>
          <span className="chat-announcement__text">{announcement.text}</span>
          {announcement.duration > 0 && announcement.expiresAt && (
            <AnnouncementTimer expiresAt={announcement.expiresAt} />
          )}
          {announcement.duration === 0 && (
            <span className="chat-announcement__badge"><AdminBadgeIcon/> Admin</span>
          )}
        </div>
      )}
      
      <div className="chat-room">
        <Confetti active={showConfetti} />
        {toast && (<div className={`toast toast--${toast.type}`}><span>{toast.message}</span><button className="toast__close" onClick={() => setToast(null)}>✕</button></div>)}
        {confirmModal && (<div className="leave-modal-overlay" onClick={() => setConfirmModal(null)}><div className="leave-modal" onClick={(e) => e.stopPropagation()}><p className="leave-modal__text">{confirmModal.message}</p><div className="leave-modal__actions"><button className="leave-modal__btn leave-modal__btn--stay" onClick={confirmModal.onConfirm}>Yes</button><button className="leave-modal__btn leave-modal__btn--leave" onClick={() => setConfirmModal(null)}>Cancel</button></div></div></div>)}
        {showLeaveModal && (<div className="leave-modal-overlay"><div className="leave-modal"><p className="leave-modal__text">You're chatting with <strong>{partner?.name}</strong></p><div className="leave-modal__warning"><p>If you leave, {partner?.name} will be notified.</p></div><div className="leave-modal__actions"><button className="leave-modal__btn leave-modal__btn--stay" onClick={()=>{setShowLeaveModal(false);window.history.pushState(null,'',window.location.href)}}>Stay</button><button className="leave-modal__btn leave-modal__btn--leave" onClick={leave}>Leave</button></div></div></div>)}
        {showSkipModal && (<div className="leave-modal-overlay"><div className="leave-modal"><p className="leave-modal__text">Skip this conversation?</p><div className="leave-modal__warning"><p>You'll be matched with someone new.</p></div><div className="leave-modal__actions"><button className="leave-modal__btn leave-modal__btn--stay" onClick={()=>{setShowSkipModal(false);window.history.pushState(null,'',window.location.href)}}>Stay</button><button className="leave-modal__btn leave-modal__btn--skip" onClick={skip}>Skip & Find New</button></div></div></div>)}
        <div className="chat-header"><div className="chat-header__partner-info"><div className="chat-header__avatar">{init(partner?.name)}</div><div className="chat-header__details"><p className="chat-header__name"><span className={`chat-header__status chat-header__status--${connectionStatus}`} />{isGroupChat?(groupName||'Group Chat'):partner?.name||'Unknown'}{isGroupChat&&<button className="chat-header__edit-group" onClick={()=>{setGroupName(partner?.name||'Group Chat');setShowGroupNameEdit(true)}}><EditIcon/></button>}</p><p className="chat-header__location">{isGroupChat?`${groupMembers.length} members`:partner?.location||''}</p></div></div><div className="chat-header__actions">{isGroupChat&&<button className="chat-header__members-btn" onClick={()=>setShowMembersPanel(!showMembersPanel)}><MembersIcon/> {groupMembers.length}</button>}<button className="chat-header__spacing-btn" onClick={toggleSpacing}><SpacingIcon compact={spacing==='compact'}/></button>{!partnerLeft&&<><button className="chat-header__skip-btn" onClick={()=>setShowSkipModal(true)}>Skip</button><button className="chat-header__leave-btn" onClick={()=>setShowLeaveModal(true)}>Leave</button></>}</div></div>
        {showGroupNameEdit&&(<div className="leave-modal-overlay"><div className="leave-modal leave-modal--group-edit"><p className="leave-modal__text">Edit Group Name</p><input className="group-edit-input" value={groupName} onChange={(e)=>setGroupName(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&handleEditGroupName()} maxLength={30} autoFocus/><div className="leave-modal__actions"><button className="leave-modal__btn leave-modal__btn--stay" onClick={handleEditGroupName}>Save</button><button className="leave-modal__btn leave-modal__btn--leave" onClick={()=>setShowGroupNameEdit(false)}>Cancel</button></div></div></div>)}
        
        <div className="chat-main-area">
          <div className={`chat-messages chat-messages--${spacing}`} ref={messagesContainerRef}>
            {showScrollBtn&&(<button className="scroll-to-bottom" onClick={()=>scrollToBottom(true)}><ScrollDownIcon/> New messages</button>)}
            {messages.length===0&&!partnerLeft&&(<div className="chat-messages__empty"><div className="chat-messages__empty-icon"><ChatIcon/></div><p className="chat-messages__empty-text">Start chatting with {isGroupChat?'the group':partner?.name}</p><p className="chat-messages__empty-subtext">Send a message to begin</p></div>)}
            {messages.map((msg,i)=> (
              <div key={i} className="message-wrapper">
                {msg.type==='system'? <div className="system-message"><span className="system-message__text">{msg.text}</span></div>
                : editingMessage?.index===i? (
                  <div className="message message--sent">
                    <textarea
                      ref={editTextareaRef}
                      className="message__edit-textarea"
                      value={editingMessage.text}
                      onChange={(e)=>setEditingMessage({...editingMessage,text:e.target.value})}
                      onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveEditedMessage()}if(e.key==='Escape')setEditingMessage(null)}}
                      onFocus={(e)=>{const val=e.target.value;e.target.setSelectionRange(val.length,val.length);}}
                      rows={1}
                      autoFocus
                    />
                    <div className="message__edit-actions">
                      <button className="message__edit-btn message__edit-btn--save" onClick={saveEditedMessage}>Save</button>
                      <button className="message__edit-btn message__edit-btn--cancel" onClick={()=>setEditingMessage(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className={`message ${msg.senderName==="You"?'message--sent':'message--received'} ${msg.isQuoted?'message--quoted':''} ${contextMenu?.index===i?'message--context-active':''}`} style={{touchAction:'manipulation'}} onClick={(e) => { if (e.target.closest('.message__read-more')) return; handleMessageDoubleClick(i); }} onTouchStart={(e)=>handleTouchStart(e,i)} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove} onContextMenu={(e)=>e.preventDefault()}>
                    {msg.replyTo&&(<div className="message__reply-context"><span className="message__reply-label">{msg.senderName==="You"?"You replied":`${msg.senderName} replied`}</span><div className="message__reply-pill">{msg.replyTo.text.slice(0,80)}{msg.replyTo.text.length>80?'...':''}</div></div>)}
                    <span className="message__sender">{msg.senderName==="You"?'You':msg.senderName} {msg.edited&&<span className="message__edited">(edited)</span>}</span>
                    <div className={`message__bubble ${msg.senderName==="You"?'message__bubble--sent':'message__bubble--received'} ${msg.text.length > 300 && !expandedMessages[msg.messageId || i] ? 'message__bubble--collapsed' : ''}`}>
                      {msg.text.length > 300 && !expandedMessages[msg.messageId || i] ? (
                        <>
                          <Linkify text={msg.text.slice(0, 300)} />
                          <button className="message__read-more" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpandedMessages(p => ({ ...p, [msg.messageId || i]: true })); }}>... See more</button>
                        </>
                      ) : (
                        <>
                          <Linkify text={msg.text} />
                          {msg.text.length > 300 && (
                            <button className="message__read-more" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpandedMessages(p => ({ ...p, [msg.messageId || i]: false })); }}>Show less</button>
                          )}
                        </>
                      )}
                    </div>
                    {reactions[i]&&<span className="message__reaction"><HeartIcon filled/></span>}
                    <div className="message__actions">
                      {msg.senderName==='You'&&(<><button className="message__action-btn" onClick={(e)=>{e.stopPropagation();handleEditMessage(i)}} title="Edit"><EditIcon/></button><button className="message__action-btn" onClick={(e)=>{e.stopPropagation();handleDeleteMessage(i)}} title="Delete"><DeleteIcon/></button></>)}
                      <button className="message__reply-btn" onClick={(e)=>{e.stopPropagation();handleReply(msg)}}><ReplyIcon/></button><span className="message__tooltip">Reply</span>
                    </div>
                    <span className="message__time">{fmt(msg.timestamp)}</span>
                  </div>
                )}
              </div>
            ))}
            {replyTarget&&(<div className="chat-reply-indicator"><div className="chat-reply-indicator__content"><span className="chat-reply-indicator__label">Replying to {replyTarget.senderName}</span><span className="chat-reply-indicator__text">{replyTarget.text.slice(0,40)}</span></div><button className="chat-reply-indicator__cancel" onClick={cancelReply}><CloseIcon/></button></div>)}
            {partnerTyping&&partnerOnline&&(<div className="typing-indicator"><div className="typing-indicator__dots"><span/><span/><span/></div>{partner?.name || 'Partner'} typing...</div>)}
            <div ref={messagesEndRef}/>
          </div>
          {isGroupChat&&showMembersPanel&&(<div className="chat-members-panel"><div className="chat-members-panel__header"><h3>Members ({groupMembers.length})</h3><button className="chat-members-panel__close" onClick={()=>setShowMembersPanel(false)}><CloseIcon/></button></div><div className="chat-members-panel__list">{groupMembers.map((m,i)=>(<div key={m.socketId||i} className="chat-members-panel__member" onClick={()=>mentionUser(m.name)}><div className="chat-members-panel__avatar" style={{background:m.socketId===socket.id?'#84cc16':'#ecfccb',color:m.socketId===socket.id?'#09090b':'#65a30d'}}>{(m.name||'?')[0].toUpperCase()}</div><div className="chat-members-panel__info"><span className="chat-members-panel__name">{m.name} {m.socketId===socket.id?'(You)':''}</span><span className="chat-members-panel__location">📍 {m.location||'Unknown'}</span></div><div className="chat-members-panel__dot" style={{background:m.online?'#84cc16':'#d4d4d8'}}/></div>))}</div></div>)}
        </div>
        {!partnerLeft&&(<div className="chat-bottom-bar"><button className="chat-bottom-bar__btn chat-bottom-bar__btn--skip" onClick={()=>setShowSkipModal(true)}>Skip</button><button className="chat-bottom-bar__btn chat-bottom-bar__btn--leave" onClick={()=>setShowLeaveModal(true)}>Leave</button></div>)}
        {!partnerLeft? (
          <div className={`chat-input ${isInputFocused?'chat-input--focused':''}`}><div className="chat-input__wrapper"><textarea ref={textareaRef} className="chat-input__field" value={message} onChange={handleInputChange} onFocus={()=>setIsInputFocused(true)} onBlur={()=>setIsInputFocused(false)} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder={!partnerOnline?`${partner?.name} disconnected...`:"Type a message..."} disabled={!partnerOnline} rows={1}/><button className={`chat-input__send-btn ${message.trim()?'chat-input__send-btn--active':''}`} onClick={sendMessage} disabled={!partnerOnline||!message.trim()}><SendIcon/></button></div></div>
        ) : (<div className="partner-left-banner"><div className="partner-left-banner__icon"><WaveIcon/></div><p className="partner-left-banner__title">{partner?.name} has left</p><p className="partner-left-banner__text">You can still read the conversation.</p><div className="chat-summary"><div className="chat-summary__item"><span className="chat-summary__value">{summary.duration}</span><span className="chat-summary__label">Duration</span></div><div className="chat-summary__item"><span className="chat-summary__value">{summary.total}</span><span className="chat-summary__label">Messages</span></div><div className="chat-summary__item"><span className="chat-summary__value">{summary.myMsgs}</span><span className="chat-summary__label">You</span></div><div className="chat-summary__item"><span className="chat-summary__value">{summary.partnerMsgs}</span><span className="chat-summary__label">{partner?.name}</span></div></div><div className="partner-left-banner__actions"><button className="partner-left-banner__btn partner-left-banner__btn--skip" onClick={skip}>Find New Partner</button><button className="partner-left-banner__btn partner-left-banner__btn--leave" onClick={leave}>Back to Profile</button></div></div>)}
        {contextMenu && (<div className="context-menu" style={{ left: `${Math.min(contextMenu.x, window.innerWidth - 180)}px`, top: `${contextMenu.y - 140}px` }} ref={contextMenuRef}><button className="context-menu__item" onClick={handleContextReply}><ReplyIcon /> Reply</button><button className="context-menu__item" onClick={handleContextReact}><HeartIcon filled /> React</button>{contextMenu.isOwn && (<><button className="context-menu__item" onClick={handleContextEdit}><EditIcon /> Edit</button><button className="context-menu__item context-menu__item--danger" onClick={handleContextDelete}><DeleteIcon /> Delete</button></>)}</div>)}
      </div>
    </>
  );
}