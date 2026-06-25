import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import socket from '../services/socket';
import './CallRoom.scss';

function MicOnIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>);}
function MicOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>);}
function SpeakerIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>);}
function SpeakerOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>);}
function PhoneOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>);}
// Replace the entire GroupCallRoom component with this fixed version:

export default function GroupCallRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const groupName = location.state?.groupName || 'Group Call';
  
  const [status, setStatus] = useState('connecting');
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [participants, setParticipants] = useState([]);
  const hasLeftRef = useRef(false);
  
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);
  
useEffect(() => {
    console.log('🎙️ Group Call Room:', roomId);
    
    // ✅ Kunin yung user info galing localStorage
    const userInfo = JSON.parse(localStorage.getItem('user') || '{}');
    const userName = userInfo.name || 'You';
    
    // ✅ Send join with userName
    socket.emit('joinGroupCall', { 
        roomId,
        userName: userName // ✅ Important: send the name!
    });
    
    // ✅ Handle participants update
    socket.on('groupCallParticipants', (data) => {
      console.log('📋 Participants updated:', data.participants);
      setParticipants(data.participants || []);
      setStatus('connected');
    });
    
    // ✅ Handle call ended - stop everything and navigate
    socket.on('groupCallEnded', () => {
      console.log('🔴 Call ended received');
      setStatus('ended');
      stopTimer();
      
      // Auto-navigate back to chat after 3 seconds
      setTimeout(() => {
        if (!hasLeftRef.current) {
          navigate(`/chat/${roomId}`, { replace: true });
        }
      }, 3000);
    });
    
    // ✅ Handle call status updates
    socket.on('groupCallStatus', (data) => {
      console.log('📞 Call status update:', data);
    });
    
    startTimer();
    
    return () => {
      console.log('🧹 Cleaning up call room');
      stopTimer();
      
      if (!hasLeftRef.current) {
        hasLeftRef.current = true;
        socket.emit('leaveGroupCall', { roomId });
      }
      
      socket.off('groupCallParticipants');
      socket.off('groupCallEnded');
      socket.off('groupCallStatus');
    };
}, [roomId]);
  
  const startTimer = () => { 
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000); 
  };
  
  const stopTimer = () => { 
    if (timerRef.current) { 
      clearInterval(timerRef.current); 
      timerRef.current = null; 
    }
  };
  
  const formatDuration = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  const toggleMic = () => setMicOn(!micOn);
  const toggleSpeaker = () => setSpeakerOn(!speakerOn);
  
  // ✅ FIXED: Proper end call sequence
  const endCall = () => {
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    
    // Stop timer immediately
    stopTimer();
    
    // Emit leave first, then end
    socket.emit('leaveGroupCall', { roomId });
    socket.emit('endGroupCall', { roomId });
    
    // Navigate after a brief delay to allow events to process
    setTimeout(() => {
      navigate(`/chat/${roomId}`, { replace: true });
    }, 100);
  };
  
  // ✅ Handle page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasLeftRef.current) {
        socket.emit('leaveGroupCall', { roomId });
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomId]);
  
  const getInitial = (name) => (name || '?').charAt(0).toUpperCase();
  
  return (
    <div className="call-room">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="call-room__container">
        <h2 className="call-room__name">{groupName}</h2>
        <div className="call-room__status">
          {status === 'connecting' && 'Connecting...'}
          {status === 'connected' && `${participants.length} participants · ${formatDuration(callDuration)}`}
          {status === 'ended' && 'Call ended'}
        </div>
        <div className="group-call__participants">
          {participants.map((p, i) => (
            <div key={p.socketId || i} className="group-call__participant">
              <div className="group-call__participant-avatar">{getInitial(p.name)}</div>
              <span className="group-call__participant-name">{p.name}</span>
              {p.socketId === socket.id && <span className="group-call__participant-you">(You)</span>}
            </div>
          ))}
        </div>
        {(status === 'connected' || status === 'connecting') && (
          <div className="call-room__controls">
            <button onClick={toggleMic} className={`call-room__ctrl ${!micOn ? 'call-room__ctrl--off' : ''}`}>
              {micOn ? <MicOnIcon /> : <MicOffIcon />}
            </button>
            <button onClick={toggleSpeaker} className={`call-room__ctrl ${!speakerOn ? 'call-room__ctrl--off' : ''}`}>
              {speakerOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
            </button>
            <button onClick={endCall} className="call-room__ctrl call-room__ctrl--end">
              <PhoneOffIcon />
            </button>
          </div>
        )}
        {status === 'ended' && (
          <div className="call-room__ended">
            <p>Call duration: {formatDuration(callDuration)}</p>
            <p>Returning to chat...</p>
            <button onClick={() => navigate(`/chat/${roomId}`, { replace: true })} className="call-room__back-btn">
              Back to Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}