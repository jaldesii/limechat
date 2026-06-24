import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import socket from "../services/socket";
import "./WaitingRoom.scss";

export default function WaitingRoom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatMode = searchParams.get('mode') || '1v1';
  
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [groups, setGroups] = useState([]);
  const hasLeftRef = useRef(false);

  useEffect(() => {
    const userString = localStorage.getItem('user');
    if (!userString) { navigate('/profile'); return; }

    try {
      const user = JSON.parse(userString);
      if (!user.name || !user.location) { navigate('/'); return; }

      if (chatMode === 'call') {
        // ✅ Auto-join call queue
        console.log('📞 Joining call queue...');
        socket.emit('joinCallQueue', { name: user.name, location: user.location });
        
        socket.on('callMatched', (data) => {
          console.log('✅ Call matched! Auto-connecting...');
          hasLeftRef.current = true;
          // ✅ Auto-connect - navigate directly to call
          navigate(`/call/${data.roomId}?host=${data.isHost}&auto=true`);
        });
      } else if (chatMode === 'group') {
        socket.emit('getGroups');
        socket.on('groupList', (data) => setGroups(data.groups || []));
        socket.on('groupJoined', (data) => {
          sessionStorage.setItem('isGroupChat', 'true');
          localStorage.setItem('roomId', data.roomId);
          localStorage.setItem('partner', JSON.stringify({ name: 'Group Chat', location: `${data.userCount} users` }));
          hasLeftRef.current = true;
          navigate(`/chat/${data.roomId}`);
        });
      } else {
        socket.emit('joinQueue', user);
        socket.on('matched', (data) => {
          localStorage.setItem('partner', JSON.stringify(data.partner));
          localStorage.setItem('roomId', data.roomId);
          hasLeftRef.current = true;
          navigate(`/chat/${data.roomId}`);
        });
      }

      const timer = setInterval(() => setSearchTime(prev => prev + 1), 1000);

      window.history.pushState(null, '', window.location.href);
      const handlePopState = () => { 
        window.history.pushState(null, '', window.location.href); 
        if (!hasLeftRef.current) setShowLeaveModal(true); 
      };
      window.addEventListener('popstate', handlePopState);
      const handleBeforeUnload = (e) => { 
        if (!hasLeftRef.current) { 
          e.preventDefault(); 
          e.returnValue = ''; 
        } 
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        socket.off('matched'); 
        socket.off('callMatched');
        socket.off('groupList'); 
        socket.off('groupJoined');
        clearInterval(timer);
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    } catch (error) { 
      navigate('/'); 
    }
  }, [navigate, chatMode]);

  const joinGroup = (groupId) => {
    const user = JSON.parse(localStorage.getItem('user'));
    socket.emit('joinGroup', { groupId, user });
  };

  const createGroup = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    socket.emit('createGroup', { user });
  };

  const leaveQueue = () => {
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    socket.emit('leaveCallQueue');
    socket.emit('leaveQueue');
    navigate('/profile', { replace: true });
  };

  const stayInQueue = () => { 
    setShowLeaveModal(false); 
    window.history.pushState(null, '', window.location.href); 
  };

  // ============================================
  // RENDER: Voice Call Mode (Simple searching)
  // ============================================
  if (chatMode === 'call') {
    return (
      <div className="waiting-room">
        {showLeaveModal && (
          <div className="leave-modal-overlay">
            <div className="leave-modal">
              <div className="leave-modal__icon">📞</div>
              <h2 className="leave-modal__title">Stop searching?</h2>
              <p className="leave-modal__text">We're finding someone for you to call.</p>
              <div className="leave-modal__hint"><p>Someone might be just about to connect with you.</p></div>
              <div className="leave-modal__actions">
                <button className="leave-modal__btn leave-modal__btn--stay" onClick={stayInQueue}>Keep searching</button>
                <button className="leave-modal__btn leave-modal__btn--leave" onClick={leaveQueue}>Cancel & go back</button>
              </div>
            </div>
          </div>
        )}

        <div className="waiting-room__card waiting-room__card--call">
          <div className="waiting-room__call-icon">📞</div>
          <h2 className="waiting-room__title">Finding a Call Partner</h2>
          <p className="waiting-room__text">Please wait while we connect you with someone</p>
          
          <div className="waiting-room__spinner" />
          
          <div className="waiting-room__timer">
            <span className="waiting-room__timer-dot" />
            Searching for <span className="waiting-room__timer-value">{Math.floor(searchTime/60)}m {searchTime%60}s</span>
          </div>
          
          <p className="waiting-room__hint">🎧 Use headphones for best quality!</p>
          
          <button className="waiting-room__cancel-btn" onClick={() => setShowLeaveModal(true)}>Cancel</button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: 1v1 & Group Chat Modes
  // ============================================
  return (
    <div className="waiting-room">
      {showLeaveModal && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <div className="leave-modal__icon">⏳</div>
            <h2 className="leave-modal__title">Stop searching?</h2>
            <p className="leave-modal__text">We're still looking for someone for you to chat with.</p>
            <div className="leave-modal__hint"><p>Someone might be just about to match with you.</p></div>
            <div className="leave-modal__actions">
              <button className="leave-modal__btn leave-modal__btn--stay" onClick={stayInQueue}>Keep searching</button>
              <button className="leave-modal__btn leave-modal__btn--leave" onClick={leaveQueue}>Cancel & go back</button>
            </div>
          </div>
        </div>
      )}

      <div className="waiting-room__card">
        {chatMode === 'group' ? (
          <>
            <h2 className="waiting-room__title">Group Chats</h2>
            <p className="waiting-room__text">Join an existing group or create a new one</p>
            
            <div className="waiting-room__groups">
              {groups.length === 0 ? (
                <p className="waiting-room__no-groups">No active groups yet. Create one!</p>
              ) : (
                groups.map((g, i) => (
                  <div key={i} className="waiting-room__group-card">
                    <div className="waiting-room__group-info">
                      <span className="waiting-room__group-name">{g.name}</span>
                      <span className="waiting-room__group-count">{g.users}/{g.maxUsers} users</span>
                    </div>
                    <button className="waiting-room__join-btn" onClick={() => joinGroup(g.id)} disabled={g.users >= g.maxUsers}>
                      {g.users >= g.maxUsers ? 'Full' : 'Join'}
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <button className="waiting-room__create-btn" onClick={createGroup}>+ Create New Group</button>
          </>
        ) : (
          <>
            <div className="waiting-room__spinner" />
            <h2 className="waiting-room__title">Finding a match</h2>
            <p className="waiting-room__text">Please wait while we connect you with someone</p>
            <div className="waiting-room__timer">
              <span className="waiting-room__timer-dot" />
              Searching for <span className="waiting-room__timer-value">{Math.floor(searchTime/60)}m {searchTime%60}s</span>
            </div>
          </>
        )}
        
        <button className="waiting-room__cancel-btn" onClick={() => setShowLeaveModal(true)}>Cancel</button>
      </div>
    </div>
  );
}