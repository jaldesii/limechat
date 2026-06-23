import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../services/socket";
import "./WaitingRoom.scss";

export default function WaitingRoom() {
  const navigate = useNavigate();
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const hasLeftRef = useRef(false);

  useEffect(() => {
    const userString = localStorage.getItem('user');
    
    if (!userString) {
      navigate('/');
      return;
    }

    try {
      const user = JSON.parse(userString);
      
      if (!user.name || !user.location) {
        navigate('/');
        return;
      }

      socket.emit('joinQueue', user);

      socket.on('matched', (data) => {
        localStorage.setItem('partner', JSON.stringify(data.partner));
        localStorage.setItem('roomId', data.roomId);
        hasLeftRef.current = true;
        navigate(`/chat/${data.roomId}`);
      });

      const timer = setInterval(() => setSearchTime(prev => prev + 1), 1000);

      // Prevent back button
      window.history.pushState(null, '', window.location.href);
      
      const handlePopState = () => {
        window.history.pushState(null, '', window.location.href);
        if (!hasLeftRef.current) setShowLeaveModal(true);
      };
      window.addEventListener('popstate', handlePopState);

      // Prevent close/refresh
      const handleBeforeUnload = (e) => {
        if (!hasLeftRef.current) {
          e.preventDefault();
          e.returnValue = '';
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      // Prevent F5/Ctrl+R
      const handleKeyDown = (e) => {
        if (!hasLeftRef.current) {
          if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
            e.preventDefault();
            setShowLeaveModal(true);
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        socket.off('matched');
        clearInterval(timer);
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('keydown', handleKeyDown);
      };
      
    } catch (error) {
      navigate('/');
    }
  }, [navigate]);

  const leaveQueue = () => {
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    socket.emit('leaveQueue');
    localStorage.removeItem('user');
    setShowLeaveModal(false);
    navigate('/', { replace: true });
  };

  const stayInQueue = () => {
    setShowLeaveModal(false);
    window.history.pushState(null, '', window.location.href);
  };

  const formatSearchTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="waiting-room">
      
      {/* ========== Leave Confirmation Modal ========== */}
      {showLeaveModal && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <div className="leave-modal__icon">⏳</div>
            <h2 className="leave-modal__title">Stop searching?</h2>
            <p className="leave-modal__text">
              We're still looking for someone for you to chat with.
            </p>
            
            <div className="leave-modal__hint">
              <p>Someone might be just about to match with you.</p>
            </div>

            <div className="leave-modal__actions">
              <button 
                className="leave-modal__btn leave-modal__btn--stay"
                onClick={stayInQueue}
              >
                Keep searching
              </button>
              
              <button 
                className="leave-modal__btn leave-modal__btn--leave"
                onClick={leaveQueue}
              >
                Cancel & go back
              </button>
            </div>
            
            <span className="leave-modal__esc-hint">Press ESC to stay</span>
          </div>
          
          {/* Hidden element for ESC key */}
          <div 
            className="esc-handler"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') stayInQueue();
            }}
            autoFocus
          />
        </div>
      )}

      {/* ========== Main Card ========== */}
      <div className="waiting-room__card">
        
        {/* Spinner */}
        <div className="waiting-room__spinner" />

        {/* Title */}
        <h2 className="waiting-room__title">Finding a match</h2>
        <p className="waiting-room__text">
          Please wait while we connect you with someone
        </p>

        {/* Timer */}
        <div className="waiting-room__timer">
          <span className="waiting-room__timer-dot" />
          Searching for
          <span className="waiting-room__timer-value">{formatSearchTime(searchTime)}</span>
        </div>

        {/* Status */}
        <div className="waiting-room__status">
          <div className="waiting-room__status-item">
            <span className="waiting-room__status-dot waiting-room__status-dot--online" />
            Connected to server
          </div>
          <div className="waiting-room__status-item">
            <span className="waiting-room__status-dot waiting-room__status-dot--searching" />
            Looking for available users
          </div>
        </div>

        {/* Cancel Button */}
        <button 
          className="waiting-room__cancel-btn"
          onClick={() => setShowLeaveModal(true)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}