import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import socket from "../services/socket";
import "./WaitingRoom.scss";

export default function WaitingRoom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatMode = searchParams.get('mode') || '1v1'; // '1v1', 'group', or 'call'
  
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [groups, setGroups] = useState([]);
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const hasLeftRef = useRef(false);

  useEffect(() => {
    const userString = localStorage.getItem('user');
    if (!userString) { navigate('/profile'); return; }

    try {
      const user = JSON.parse(userString);
      if (!user.name || !user.location) { navigate('/'); return; }

      if (chatMode === 'call') {
        // ✅ Voice Call Mode - No socket listeners needed here
        // User will create or join a call room manually
        return;
      }

      if (chatMode === 'group') {
        // Request group list
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
        // 1v1 mode
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

  // ✅ Voice Call: Create Room
  const createCallRoom = () => {
    setIsCreating(true);
    setError('');
    
    socket.emit("createRoom", (response) => {
      setIsCreating(false);
      if (response.roomId) {
        hasLeftRef.current = true;
        navigate(`/call/${response.roomId}?host=true`);
      } else {
        setError('Failed to create room. Try again.');
      }
    });
  };

  // ✅ Voice Call: Join Room
  const joinCallRoom = () => {
    if (!roomCode.trim()) {
      setError('Enter a room code');
      return;
    }
    
    setError('');
    socket.emit("joinRoom", roomCode.trim().toUpperCase(), (response) => {
      if (response.error) {
        setError(response.error);
      } else {
        hasLeftRef.current = true;
        navigate(`/call/${roomCode.trim().toUpperCase()}`);
      }
    });
  };

  const leaveQueue = () => {
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    if (chatMode !== 'call') {
      socket.emit('leaveQueue');
    }
    navigate('/profile', { replace: true });
  };

  const stayInQueue = () => { 
    setShowLeaveModal(false); 
    window.history.pushState(null, '', window.location.href); 
  };

  // ============================================
  // RENDER: Voice Call Mode
  // ============================================
  if (chatMode === 'call') {
    return (
      <div className="waiting-room">
        {showLeaveModal && (
          <div className="leave-modal-overlay">
            <div className="leave-modal">
              <div className="leave-modal__icon">📞</div>
              <h2 className="leave-modal__title">Leave call setup?</h2>
              <p className="leave-modal__text">You'll go back to the profile page.</p>
              <div className="leave-modal__actions">
                <button className="leave-modal__btn leave-modal__btn--stay" onClick={stayInQueue}>Stay</button>
                <button className="leave-modal__btn leave-modal__btn--leave" onClick={leaveQueue}>Go back</button>
              </div>
            </div>
          </div>
        )}

        <div className="waiting-room__card waiting-room__card--call">
          <div className="waiting-room__call-icon">📞</div>
          <h2 className="waiting-room__title">Voice Call</h2>
          <p className="waiting-room__text">Create a call room or join an existing one</p>
          
          {error && <div className="waiting-room__error">{error}</div>}
          
          {/* Create Call Room */}
          <button 
            onClick={createCallRoom} 
            disabled={isCreating}
            className="waiting-room__call-btn waiting-room__call-btn--create"
          >
            {isCreating ? 'Creating...' : '🎙️ Create New Call'}
          </button>
          
          <div className="waiting-room__divider">
            <span>OR</span>
          </div>
          
          {/* Join Call Room */}
          <div className="waiting-room__join-call">
            <input
              type="text"
              placeholder="Enter Room Code"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && joinCallRoom()}
              maxLength={6}
              className="waiting-room__room-input"
            />
            <button onClick={joinCallRoom} className="waiting-room__call-btn waiting-room__call-btn--join">
              Join Call
            </button>
          </div>
          
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