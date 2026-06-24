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
  const [audioQuality, setAudioQuality] = useState('standard'); // standard, hd
  
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  
  // ✅ ENHANCED Servers config
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

  // ✅ Setup socket listeners
  useEffect(() => {
    console.log('📍 CallRoom loaded');
    console.log('📍 Room ID:', roomId);
    console.log('📍 Is Host:', isHost);
    console.log('📍 Socket connected:', socket.connected);
    
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
    
    // WebRTC Signaling
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
  
  // ✅ Start microphone with ENHANCED quality
  const startMic = async () => {
    setStatus('connecting');
    setErrorMsg('');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        setErrorMsg('⚠️ Microphone requires HTTPS. Use the secure link.');
      } else {
        setErrorMsg('Browser not supported. Please use Chrome, Firefox, or Edge.');
      }
      setStatus('error');
      return;
    }
    
    console.log('🔍 Protocol:', window.location.protocol);
    console.log('🔍 Hostname:', window.location.hostname);
    
    try {
      console.log('🎤 Requesting HIGH QUALITY microphone...');
      
      // ✅ HIGH QUALITY AUDIO CONSTRAINTS
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          volume: 1.0,
          latency: 0.01,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
        } 
      });
      
      console.log('✅ HD Mic ready! Settings:', stream.getAudioTracks()[0].getSettings());
      setAudioQuality('hd');
      localStreamRef.current = stream;
      setMicReady(true);
      createPeerConnection(stream);
      
    } catch (err) {
      console.warn('⚠️ HD quality failed, trying standard...', err.message);
      
      // Fallback to standard quality
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });
        
        console.log('✅ Standard mic ready');
        setAudioQuality('standard');
        localStreamRef.current = stream;
        setMicReady(true);
        createPeerConnection(stream);
        
      } catch (fallbackErr) {
        console.error('❌ All mic attempts failed:', fallbackErr);
        
        if (fallbackErr.name === 'NotAllowedError') {
          setErrorMsg('Microphone access denied. Please allow mic in browser settings.');
        } else if (fallbackErr.name === 'NotFoundError') {
          setErrorMsg('No microphone found on your device.');
        } else {
          setErrorMsg('Error: ' + fallbackErr.message);
        }
        setStatus('error');
      }
    }
  };
  
  // ✅ Create ENHANCED Peer Connection
  const createPeerConnection = (stream) => {
    console.log('🔗 Creating enhanced peer connection...');
    const peer = new RTCPeerConnection(servers);
    
    // Add local audio tracks
    stream.getTracks().forEach(track => {
      console.log('🎵 Adding track:', track.kind, track.getSettings());
      peer.addTrack(track, stream);
    });
    
    // ✅ Set Opus codec preference (best for voice)
    try {
      const transceivers = peer.getTransceivers();
      transceivers.forEach(transceiver => {
        if (transceiver.sender && transceiver.sender.track?.kind === 'audio') {
          const capabilities = RTCRtpSender.getCapabilities('audio');
          if (capabilities) {
            const opusCodec = capabilities.codecs.find(codec => 
              codec.mimeType === 'audio/opus' && codec.clockRate === 48000
            );
            if (opusCodec) {
              transceiver.setCodecPreferences([opusCodec]);
              console.log('✅ Audio codec set: Opus 48kHz');
            }
          }
        }
      });
    } catch (e) {
      console.log('⚠️ Could not set codec preference:', e.message);
    }
    
    // Handle remote audio
    peer.ontrack = (event) => {
      console.log('📞 Remote audio received! Streams:', event.streams.length);
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        console.log('🔊 Remote audio attached');
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
    
    // Connection state monitoring
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
    
    // ✅ Set max bitrate for HD audio
    setTimeout(() => {
      try {
        const senders = peer.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 128000; // 128kbps HD audio
            params.encodings[0].priority = 'high';
            sender.setParameters(params);
            console.log('✅ Audio bitrate set: 128kbps HD');
          }
        });
      } catch (e) {
        console.log('⚠️ Could not set bitrate:', e.message);
      }
    }, 1000);
    
    // If guest, create offer immediately
    if (!isHost) {
      console.log('👤 Guest creating offer...');
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => {
          socket.emit("offer", { sdp: peer.localDescription, roomId });
          setStatus('calling');
          console.log('📤 Offer sent by guest');
        })
        .catch(err => console.error('❌ Guest offer error:', err));
    } else {
      console.log('👑 Host waiting for guest to join...');
    }
  };
  
  // ✅ Timer functions
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
  
  // ✅ Toggle mic
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicOn(audioTrack.enabled);
      }
    }
  };
  
  // ✅ End call
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
  
  // ✅ Copy room code
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      alert('Room code copied! Share this with the person you want to call.');
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
      {/* Hidden audio element for remote audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      <div className="call-room__container">
        {/* Avatar */}
        <div className={`call-room__avatar ${status === 'connected' ? 'call-room__avatar--active' : ''}`}>
          <span>{isHost ? '📞' : '🎧'}</span>
        </div>
        
        {/* Name */}
        <h2 className="call-room__name">
          {isHost ? 'Your Call Room' : 'Voice Call'}
        </h2>
        
        {/* Status */}
        <div className="call-room__status">
          {!socketConnected && '🔌 Connecting to server...'}
          {socketConnected && status === 'waiting' && '🎙️ Ready to connect'}
          {status === 'connecting' && '🎙️ Setting up microphone...'}
          {status === 'calling' && '📞 Calling...'}
          {status === 'connected' && `📞 On call · ${formatDuration(callDuration)}`}
          {status === 'ended' && '🔴 Call Ended'}
          {status === 'error' && '❌ Error'}
        </div>
        
        {/* ✅ Audio Quality Badge */}
        {status === 'connected' && (
          <div className="call-room__quality">
            <span className="call-room__quality-dot"></span>
            {audioQuality === 'hd' ? 'HD Audio' : 'Standard Audio'}
          </div>
        )}
        
        {/* Error Message */}
        {status === 'error' && (
          <div className="call-room__error-msg">
            <p>{errorMsg}</p>
            <button onClick={retryMic} className="call-room__retry-btn">🔄 Try Again</button>
          </div>
        )}
        
        {/* Room Code (Host only - shown before starting) */}
        {isHost && !micReady && status !== 'error' && socketConnected && (
          <div className="call-room__code" onClick={copyRoomCode}>
            <span>📋 Room Code (tap to copy)</span>
            <strong>{roomId}</strong>
            <small>Share this code with the person you want to call</small>
          </div>
        )}
        
        {/* Start Call Button */}
        {!micReady && status !== 'error' && socketConnected && (
          <button onClick={startMic} className="call-room__start-btn">
            🎙️ Start Call
          </button>
        )}
        
        {/* Waiting for guest */}
        {isHost && micReady && status === 'connecting' && (
          <div className="call-room__waiting">
            <div className="call-room__spinner" />
            <p>Waiting for someone to join...</p>
            <small>Room Code: <strong>{roomId}</strong></small>
          </div>
        )}
        
        {/* Audio Waves (During call) */}
        {status === 'connected' && (
          <div className="call-room__waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
        )}
        
        {/* Controls */}
        {(status === 'connected' || status === 'calling') && (
          <div className="call-room__controls">
            <button 
              onClick={toggleMic}
              className={`call-room__ctrl ${micOn ? '' : 'call-room__ctrl--off'}`}
              title={micOn ? 'Mute' : 'Unmute'}
            >
              {micOn ? '🎤' : '🔇'}
            </button>
            <button onClick={endCall} className="call-room__ctrl call-room__ctrl--end">
              🔴 End Call
            </button>
          </div>
        )}
        
        {/* Ended State */}
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