import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import './CallRoom.scss';

// ✅ Real SVG Icons (No Emojis!)
function MicOnIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>);}
function MicOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>);}
function SpeakerIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>);}
function SpeakerOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>);}
function PhoneOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>);}
function AudioWaveIcon() { return (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"><path d="M12 2v20M8 6v12M16 6v12M4 10v4M20 10v4"/></svg>);}

export default function CallRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get('host') === 'true';
  const isAuto = searchParams.get('auto') === 'true';
  const navigate = useNavigate();
  
  const [status, setStatus] = useState('connecting');
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerLocation, setPartnerLocation] = useState('');
  const [myName, setMyName] = useState('');
  const [myLocation, setMyLocation] = useState('');
  
  const remoteAudioRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  
  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
  };

  // ✅ Get user info
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setMyName(user.name || 'You');
    setMyLocation(user.location || '');
  }, []);

  // ✅ AUTO-START on load
  useEffect(() => {
    console.log('📍 CallRoom - Auto-connecting...');
    
    if (isAuto) {
      setTimeout(() => startMic(), 300);
    }
    
    socket.on("userJoined", async (data) => {
      if (peerRef.current && isHost) {
        try {
          const offer = await peerRef.current.createOffer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true,
          });
          await peerRef.current.setLocalDescription(offer);
          socket.emit("offer", { sdp: offer, roomId });
          setStatus('calling');
        } catch (err) {
          console.error('❌ Offer error:', err);
        }
      }
    });
    
    socket.on("callPartnerInfo", (data) => {
      setPartnerName(data.name || 'Partner');
      setPartnerLocation(data.location || '');
    });
    
    socket.on("offer", async (data) => {
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await peerRef.current.createAnswer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true,
          });
          await peerRef.current.setLocalDescription(answer);
          socket.emit("answer", { sdp: answer, roomId });
        } catch (err) {
          console.error('❌ Answer error:', err);
        }
      }
    });
    
    socket.on("answer", async (data) => {
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (err) {
          console.error('❌ Answer error:', err);
        }
      }
    });
    
    socket.on("iceCandidate", async (data) => {
      if (peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {}
      }
    });
    
    socket.on("callEnded", () => { setStatus('ended'); stopTimer(); });
    socket.on("userLeft", () => { setStatus('ended'); stopTimer(); });
    
    // ✅ Send partner info
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    socket.emit('sendCallPartnerInfo', { 
      roomId, 
      name: user.name || 'Anonymous', 
      location: user.location || '' 
    });
    
    return () => {
      stopTimer();
      cleanupAudio();
      socket.off("userJoined"); socket.off("offer"); socket.off("answer");
      socket.off("iceCandidate"); socket.off("callEnded"); socket.off("userLeft");
      socket.off("callPartnerInfo");
    };
  }, [roomId, isHost]);
  
  // ✅ Start mic - AUTO HD quality with noise cancellation
  const startMic = async () => {
    setStatus('connecting');
    setErrorMsg('');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Browser not supported.');
      setStatus('error');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: { exact: true },
          googEchoCancellation: true,
          googEchoCancellation2: true,
          noiseSuppression: { ideal: true },
          googNoiseSuppression: true,
          autoGainControl: { ideal: true },
          googAutoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          volume: 1.0,
          latency: 0.01,
          googHighpassFilter: true,
        } 
      });
      
      localStreamRef.current = stream;
      createPeerConnection(stream);
      
    } catch (err) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            volume: 1.0,
          } 
        });
        localStreamRef.current = stream;
        createPeerConnection(stream);
      } catch (fallbackErr) {
        setErrorMsg('Cannot access microphone.');
        setStatus('error');
      }
    }
  };
  
  const createPeerConnection = (stream) => {
    const peer = new RTCPeerConnection(servers);
    
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
    
    peer.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.volume = 1.0;
      }
      setStatus('connected');
      startTimer();
    };
    
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit("iceCandidate", { candidate: event.candidate, roomId });
    };
    
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        setStatus('ended'); stopTimer();
      }
    };
    
    peerRef.current = peer;
    
    setTimeout(() => {
      try {
        const senders = peer.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 256000;
            params.encodings[0].priority = 'very-high';
            sender.setParameters(params);
          }
        });
      } catch (e) {}
    }, 1000);
    
    if (!isHost) {
      peer.createOffer({ offerToReceiveAudio: true, voiceActivityDetection: true })
        .then(offer => peer.setLocalDescription(offer))
        .then(() => { socket.emit("offer", { sdp: peer.localDescription, roomId }); setStatus('calling'); })
        .catch(err => console.error('❌ Offer:', err));
    }
  };
  
  const cleanupAudio = () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (peerRef.current) peerRef.current.close();
  };
  
  const startTimer = () => { timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000); };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const formatDuration = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  
  const toggleMic = () => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
    }
  };
  
  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = speakerOn ? 0 : 1.0;
      setSpeakerOn(!speakerOn);
    }
  };
  
  const endCall = () => { 
    cleanupAudio(); 
    socket.emit("endCall", roomId); 
    stopTimer(); 
    navigate('/waiting?mode=call'); 
  };
  
  const getInitial = (name) => (name || '?').charAt(0).toUpperCase();
  
  return (
    <div className="call-room">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      <div className="call-room__container">
        {/* Partner Avatar with Initial */}
        <div className={`call-room__avatar ${status === 'connected' ? 'call-room__avatar--active' : ''}`}>
          <span className="call-room__avatar-text">
            {status === 'connected' ? getInitial(partnerName) : <AudioWaveIcon />}
          </span>
        </div>
        
        {/* Partner Info */}
        <h2 className="call-room__name">
          {status === 'connected' ? partnerName || 'Partner' : 'Connecting...'}
        </h2>
        
        {partnerLocation && status === 'connected' && (
          <p className="call-room__location">{partnerLocation}</p>
        )}
        
        {/* Call Status */}
        <div className="call-room__status">
          {status === 'connecting' && 'Setting up HD audio...'}
          {status === 'calling' && 'Ringing...'}
          {status === 'connected' && formatDuration(callDuration)}
          {status === 'ended' && 'Call ended'}
          {status === 'error' && 'Error'}
        </div>
        
        {/* HD Audio Badge */}
        {status === 'connected' && (
          <div className="call-room__quality">
            <span className="call-room__quality-dot"></span>
            HD Audio · Noise Cancelled
          </div>
        )}
        
        {/* Your Info (Bottom preview) */}
        {status === 'connected' && (
          <div className="call-room__my-info">
            <div className="call-room__my-avatar">{getInitial(myName)}</div>
            <div className="call-room__my-details">
              <span className="call-room__my-name">{myName}</span>
              <span className="call-room__my-location">{myLocation}</span>
            </div>
          </div>
        )}
        
        {/* Audio Waves */}
        {status === 'connected' && (
          <div className="call-room__waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
        )}
        
        {/* Error */}
        {status === 'error' && (
          <div className="call-room__error-msg">
            <p>{errorMsg}</p>
            <button onClick={startMic} className="call-room__retry-btn">Retry</button>
          </div>
        )}
        
        {/* Controls - 3 Buttons Only! */}
        {(status === 'connected' || status === 'calling') && (
          <div className="call-room__controls">
            <button 
              onClick={toggleMic}
              className={`call-room__ctrl ${!micOn ? 'call-room__ctrl--off' : ''}`}
              title={micOn ? 'Mute' : 'Unmute'}
            >
              {micOn ? <MicOnIcon /> : <MicOffIcon />}
            </button>
            
            <button 
              onClick={toggleSpeaker}
              className={`call-room__ctrl ${!speakerOn ? 'call-room__ctrl--off' : ''}`}
              title={speakerOn ? 'Speaker' : 'Earpiece'}
            >
              {speakerOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
            </button>
            
            <button onClick={endCall} className="call-room__ctrl call-room__ctrl--end">
              <PhoneOffIcon />
            </button>
          </div>
        )}
        
        {/* Ended State */}
        {status === 'ended' && (
          <div className="call-room__ended">
            <p>Call duration: {formatDuration(callDuration)}</p>
            <button onClick={() => navigate('/waiting?mode=call')} className="call-room__back-btn">
              Find New Partner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}