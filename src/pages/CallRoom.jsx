import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import './CallRoom.scss';

export default function CallRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get('host') === 'true';
  const navigate = useNavigate();
  
  const [status, setStatus] = useState('waiting');
  const [micOn, setMicOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  
  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  // ✅ Check socket connection first
  useEffect(() => {
    console.log('📍 CallRoom loaded');
    console.log('📍 Room ID:', roomId);
    console.log('📍 Is Host:', isHost);
    console.log('📍 Socket connected:', socket.connected);
    
    // Wait for socket to connect
    if (socket.connected) {
      setSocketConnected(true);
      console.log('✅ Socket already connected');
    } else {
      console.log('⏳ Waiting for socket connection...');
      socket.on('connect', () => {
        setSocketConnected(true);
        console.log('✅ Socket connected!');
      });
    }
    
    // Setup socket listeners for WebRTC
    socket.on("userJoined", async (data) => {
      console.log('👋 Guest joined!', data);
      if (peerRef.current && isHost) {
        try {
          const offer = await peerRef.current.createOffer();
          await peerRef.current.setLocalDescription(offer);
          socket.emit("offer", { sdp: offer, roomId });
          setStatus('calling');
          console.log('📤 Offer sent to guest');
        } catch (err) {
          console.error('❌ Offer error:', err);
        }
      }
    });
    
    socket.on("offer", async (data) => {
      console.log('📥 Received offer from host');
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(answer);
          socket.emit("answer", { sdp: answer, roomId });
          console.log('📤 Answer sent to host');
        } catch (err) {
          console.error('❌ Answer error:', err);
        }
      }
    });
    
    socket.on("answer", async (data) => {
      console.log('📥 Received answer from guest');
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log('✅ WebRTC connection established!');
        } catch (err) {
          console.error('❌ Answer set error:', err);
        }
      }
    });
    
    socket.on("iceCandidate", async (data) => {
      if (peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('🧊 ICE candidate added');
        } catch (err) {
          console.error('❌ ICE error:', err);
        }
      }
    });
    
    socket.on("callEnded", () => {
      console.log('🔴 Call ended by partner');
      setStatus('ended');
      stopTimer();
    });
    
    socket.on("userLeft", () => {
      console.log('👋 Partner left');
      setStatus('ended');
      stopTimer();
    });
    
    return () => {
      stopTimer();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.close();
      }
      socket.off("userJoined");
      socket.off("offer");
      socket.off("answer");
      socket.off("iceCandidate");
      socket.off("callEnded");
      socket.off("userLeft");
      socket.off("connect");
    };
  }, [roomId, isHost]);
  
  // Start microphone + Create peer connection
  const startMic = async () => {
    setStatus('connecting');
    setErrorMsg('');
    
    console.log('🔍 Browser:', navigator.userAgent.substring(0, 80));
    console.log('🔍 Protocol:', window.location.protocol);
    console.log('🔍 Socket ready:', socket.connected);
    
    try {
      console.log('🎤 Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      console.log('✅ Mic granted! Audio tracks:', stream.getAudioTracks().length);
      localStreamRef.current = stream;
      setMicReady(true);
      
      // ✅ Create peer connection
      console.log('🔗 Creating peer connection...');
      const peer = new RTCPeerConnection(servers);
      
      // Add local audio tracks
      stream.getTracks().forEach(track => {
        console.log('🎵 Adding track:', track.kind);
        peer.addTrack(track, stream);
      });
      
      // Handle remote audio
      peer.ontrack = (event) => {
        console.log('📞 Remote audio received! Streams:', event.streams.length);
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          console.log('🔊 Remote audio attached to element');
        }
        setStatus('connected');
        startTimer();
      };
      
      // ICE candidates
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate');
          socket.emit("iceCandidate", { candidate: event.candidate, roomId });
        }
      };
      
      // Connection state
      peer.oniceconnectionstatechange = () => {
        console.log('🔗 ICE state:', peer.iceConnectionState);
      };
      
      peer.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', peer.connectionState);
        if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
          setStatus('ended');
          stopTimer();
        }
      };
      
      peerRef.current = peer;
      
      // If guest, create offer immediately
      if (!isHost) {
        console.log('👤 Guest creating offer...');
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.emit("offer", { sdp: offer, roomId });
          setStatus('calling');
          console.log('📤 Offer sent by guest');
        } catch (err) {
          console.error('❌ Guest offer error:', err);
        }
      } else {
        console.log('👑 Host waiting for guest to join...');
      }
      
    } catch (err) {
      console.error('❌ Mic Error:', err.name, err.message);
      
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Microphone access denied. Please allow mic in browser settings.');
      } else if (err.name === 'NotFoundError') {
        setErrorMsg('No microphone found.');
      } else {
        setErrorMsg('Error: ' + err.message);
      }
      setStatus('error');
    }
  };
  
  // Timer
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };
  
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicOn(audioTrack.enabled);
      }
    }
  };
  
  const endCall = () => {
    console.log('🔴 Ending call...');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerRef.current) {
      peerRef.current.close();
    }
    socket.emit("endCall", roomId);
    stopTimer();
    navigate('/waiting?mode=call');
  };
  
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      alert('Room code copied! Share this code.');
    }).catch(() => {
      alert('Room Code: ' + roomId);
    });
  };
  
  const retryMic = () => {
    setStatus('waiting');
    setErrorMsg('');
    setMicReady(false);
  };
  
  return (
    <div className="call-room">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      <div className="call-room__container">
        <div className={`call-room__avatar ${status === 'connected' ? 'call-room__avatar--active' : ''}`}>
          <span>{isHost ? '📞' : '🎧'}</span>
        </div>
        
        <h2 className="call-room__name">
          {isHost ? 'Your Call Room' : 'Voice Call'}
        </h2>
        
        <div className="call-room__status">
          {!socketConnected && '🔌 Connecting to server...'}
          {socketConnected && status === 'waiting' && '🎙️ Ready to connect'}
          {status === 'connecting' && '🎙️ Setting up microphone...'}
          {status === 'calling' && '📞 Calling...'}
          {status === 'connected' && `📞 On call · ${formatDuration(callDuration)}`}
          {status === 'ended' && '🔴 Call Ended'}
          {status === 'error' && '❌ Error'}
        </div>
        
        {status === 'error' && (
          <div className="call-room__error-msg">
            <p>{errorMsg}</p>
            <button onClick={retryMic} className="call-room__retry-btn">🔄 Try Again</button>
          </div>
        )}
        
        {isHost && !micReady && status !== 'error' && socketConnected && (
          <div className="call-room__code" onClick={copyRoomCode}>
            <span>📋 Room Code (tap to copy)</span>
            <strong>{roomId}</strong>
            <small>Share this code</small>
          </div>
        )}
        
        {!micReady && status !== 'error' && socketConnected && (
          <button onClick={startMic} className="call-room__start-btn">
            🎙️ Start Call
          </button>
        )}
        
        {isHost && micReady && status === 'connecting' && (
          <div className="call-room__waiting">
            <div className="call-room__spinner" />
            <p>Waiting for someone to join...</p>
            <small>Room Code: <strong>{roomId}</strong></small>
          </div>
        )}
        
        {status === 'connected' && (
          <div className="call-room__waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
        )}
        
        {(status === 'connected' || status === 'calling') && (
          <div className="call-room__controls">
            <button 
              onClick={toggleMic}
              className={`call-room__ctrl ${micOn ? '' : 'call-room__ctrl--off'}`}
            >
              {micOn ? '🎤' : '🔇'}
            </button>
            <button onClick={endCall} className="call-room__ctrl call-room__ctrl--end">
              🔴 End Call
            </button>
          </div>
        )}
        
        {status === 'ended' && (
          <div className="call-room__ended">
            <p>Call duration: {formatDuration(callDuration)}</p>
            <button onClick={() => navigate('/waiting?mode=call')} className="call-room__back-btn">
              ← Back to Calls
            </button>
          </div>
        )}
      </div>
    </div>
  );
}