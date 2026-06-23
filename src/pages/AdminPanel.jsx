import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./AdminPanel.scss";

// ✅ Dynamic server URL
const SERVER_URL = import.meta.env.PROD 
  ? window.location.origin
  : 'http://192.168.254.139:3001';

const adminSocket = io(SERVER_URL, {
  query: { role: 'admin' }
});

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [stats, setStats] = useState({ totalVisitors: 0, totalMatches: 0, activeNow: 0, waitingNow: 0 });
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announceDuration, setAnnounceDuration] = useState(5);
  const [currentAnnouncement, setCurrentAnnouncement] = useState(null);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);

  const durationOptions = [
    { value: 1, label: '1 min' },
    { value: 5, label: '5 min' },
    { value: 10, label: '10 min' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
    { value: 0, label: 'Manual' },
  ];

  useEffect(() => {
    adminSocket.emit('adminGetData');

    adminSocket.on('adminUpdate', (data) => {
      const filtered = (data.users || []).filter(u => {
        if (u.status === 'connected' || u.status === 'waiting') return true;
        return (Date.now() - new Date(u.lastActive).getTime()) < 60000;
      });
      filtered.sort((a, b) => ({ connected: 1, waiting: 2, disconnected: 3 }[a.status] || 4) - ({ connected: 1, waiting: 2, disconnected: 3 }[b.status] || 4));
      setUsers(filtered);
      setActiveChats(data.activeChats || []);
      setStats({
        totalVisitors: data.totalVisitors || 0,
        totalMatches: data.totalMatches || 0,
        activeNow: data.activeNow || 0,
        waitingNow: data.waitingNow || 0
      });
      setCurrentAnnouncement(data.announcement || null);
    });

    adminSocket.on('adminNewUser', () => adminSocket.emit('adminGetData'));
    adminSocket.on('adminMatch', () => adminSocket.emit('adminGetData'));
    adminSocket.on('adminChatEnded', (d) => setActiveChats(prev => prev.filter(c => c.roomId !== d.roomId)));

    const interval = setInterval(() => adminSocket.emit('adminGetData'), 8000);
    return () => {
      adminSocket.off('adminUpdate');
      adminSocket.off('adminNewUser');
      adminSocket.off('adminMatch');
      adminSocket.off('adminChatEnded');
      clearInterval(interval);
    };
  }, []);

  const handleSendAnnouncement = () => {
    if (!announcement.trim()) return;
    adminSocket.emit('adminAnnouncement', { 
      text: announcement, 
      duration: announceDuration
    });
    setAnnouncement("");
    setShowAnnounceForm(false);
  };

  const handleClearAnnouncement = () => {
    adminSocket.emit('adminClearAnnouncement');
  };

  const timeAgo = (ts) => {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 5) return 'now';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  };

  const getRemainingTime = () => {
    if (!currentAnnouncement?.expiresAt) return null;
    const remaining = Math.floor((new Date(currentAnnouncement.expiresAt).getTime() - Date.now()) / 1000);
    if (remaining <= 0) return 'Expired';
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const filtered = users.filter(u => {
    const match = (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (u.location || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!match) return false;
    if (selectedTab === 'active') return u.status === 'connected';
    if (selectedTab === 'waiting') return u.status === 'waiting';
    return true;
  });

  const tabs = [
    { key: 'all', label: 'All', count: users.length },
    { key: 'active', label: 'Active', count: users.filter(u => u.status === 'connected').length },
    { key: 'waiting', label: 'Waiting', count: users.filter(u => u.status === 'waiting').length },
  ];

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!currentAnnouncement?.expiresAt) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [currentAnnouncement]);

  return (
    <div className="admin">
      <div className="admin__top">
        <div className="admin__top-left">
          <span className="admin__logo">LimeChat</span>
          <span className="admin__sep">/</span>
          <span className="admin__label">admin</span>
        </div>
        <div className="admin__top-right">
          <span className="admin__stat-inline"><b>{stats.activeNow}</b> online</span>
          <span className="admin__stat-inline"><b>{stats.waitingNow}</b> waiting</span>
          <span className="admin__stat-inline"><b>{stats.totalMatches}</b> matches</span>
          <span className="admin__stat-inline"><b>{stats.totalVisitors}</b> visitors</span>
          <button className="admin__btn" onClick={() => adminSocket.emit('adminClearStale')}>clear</button>
          <button className="admin__btn" onClick={() => adminSocket.emit('adminGetData')}>refresh</button>
        </div>
      </div>

      <div className="admin__announce">
        {currentAnnouncement ? (
          <div className="admin__announce-active">
            <div className="admin__announce-info">
              <span className="admin__announce-label">📢</span>
              <span className="admin__announce-text">"{currentAnnouncement.text}"</span>
              {currentAnnouncement.duration > 0 && (
                <span className="admin__announce-timer">⏱ {getRemainingTime()}</span>
              )}
              {currentAnnouncement.duration === 0 && (
                <span className="admin__announce-badge">Manual</span>
              )}
            </div>
            <button className="admin__announce-clear" onClick={handleClearAnnouncement}>✕</button>
          </div>
        ) : showAnnounceForm ? (
          <div className="admin__announce-form">
            <input 
              className="admin__announce-input" 
              placeholder="Announcement text..." 
              value={announcement} 
              onChange={(e) => setAnnouncement(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSendAnnouncement()} 
              autoFocus 
            />
            <select 
              className="admin__announce-select"
              value={announceDuration}
              onChange={(e) => setAnnounceDuration(Number(e.target.value))}
            >
              {durationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button className="admin__announce-send" onClick={handleSendAnnouncement}>Send</button>
            <button className="admin__announce-cancel" onClick={() => setShowAnnounceForm(false)}>Cancel</button>
          </div>
        ) : (
          <button className="admin__announce-btn" onClick={() => setShowAnnounceForm(true)}>
            📢 New Announcement
          </button>
        )}
      </div>

      <div className="admin__bar">
        <input className="admin__search" placeholder="Filter..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <div className="admin__tabs">
          {tabs.map(t => (
            <button key={t.key} className={`admin__tab ${selectedTab === t.key ? 'admin__tab--on' : ''}`} onClick={() => setSelectedTab(t.key)}>
              {t.label} <span className="admin__tab-count">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <table className="admin__table">
        <thead><tr><th>user</th><th>location</th><th>status</th><th>room</th><th>active</th></tr></thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={5} className="admin__empty">— no users —</td></tr>
          ) : filtered.map((u, i) => (
            <tr key={u.socketId + i}>
              <td><span className="admin__user"><span className="admin__user-dot" style={{ background: u.status === 'connected' ? '#84cc16' : u.status === 'waiting' ? '#fbbf24' : '#d4d4d8' }} />{u.name || 'Anonymous'}</span></td>
              <td className="admin__muted">{u.location || '—'}</td>
              <td>{u.status === 'connected' ? 'active' : u.status === 'waiting' ? 'waiting' : 'offline'}</td>
              <td className="admin__mono">{u.roomId ? `#${u.roomId.slice(-6)}` : '—'}</td>
              <td className="admin__muted">{timeAgo(u.lastActive)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {activeChats.length > 0 && (
        <>
          <div className="admin__section-title">active chats ({activeChats.length})</div>
          <table className="admin__table">
            <thead><tr><th>room</th><th>users</th><th>started</th></tr></thead>
            <tbody>
              {activeChats.map((c, i) => (
                <tr key={c.roomId || i}>
                  <td className="admin__mono">#{c.roomId?.slice(-6)}</td>
                  <td>{c.user1 || '?'} <span className="admin__muted">↔</span> {c.user2 || '?'}</td>
                  <td className="admin__muted">{timeAgo(c.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}