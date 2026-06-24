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
  const [speakerOn, setSpeakerOn] = useState(false);
  const [volumeBoosted, setVolumeBoosted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [audioQuality, setAudioQuality] = useState('standard');
  
  const localAudioRef = useRef(null);
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

  useEffect(() => {
    console.log('📍 CallRoom loaded - Room:', roomId);
    
    if (socket.connected) {
      setSocketConnected(true);
    } else {
      socket.on('connect', () => setSocketConnected(true));
    }
    
    socket.on("userJoined", async (data) => {
      console.log('👋 Guest joined!');
      if (peerRef.current && isHost) {
        try {
          const offer = await peerRef.current.createOffer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true,
          });
          await peerRef.current.setLocalDescription(offer);
          socket.emit("offer", { sdp: offer, roomId });
          setStatus('calling');
          console.log('📤 Offer sent');
        } catch (err) {
          console.error('❌ Offer error:', err);
        }
      }
    });
    
    socket.on("offer", async (data) => {
      console.log('📥 Received offer');
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
      console.log('📥 Received answer');
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log('✅ Connected!');
        } catch (err) {
          console.error('❌ Answer error:', err);
        }
      }
    });
    
    socket.on("iceCandidate", async (data) => {
      if (peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('❌ ICE error:', err);
        }
      }
    });
    
    socket.on("callEnded", () => { setStatus('ended'); stopTimer(); });
    socket.on("userLeft", () => { setStatus('ended'); stopTimer(); });
    
    return () => {
      stopTimer();
      cleanupAudio();
      socket.off("userJoined"); socket.off("offer"); socket.off("answer");
      socket.off("iceCandidate"); socket.off("callEnded"); socket.off("userLeft");
      socket.off("connect");
    };
  }, [roomId, isHost]);
  
  // ✅ Start mic - ECHO CANCELLATION ON + MAX VOLUME
  const startMic = async () => {
    setStatus('connecting');
    setErrorMsg('');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Browser not supported. Use Chrome or Firefox.');
      setStatus('error');
      return;
    }
    
    try {
      console.log('🎤 Requesting mic (Echo Cancellation ON, Max Volume)...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          // ============================================
          // ✅ ECHO CANCELLATION - KEPT!
          // ============================================
          echoCancellation: { exact: true },
          googEchoCancellation: true,
          googEchoCancellation2: true,
          
          // ============================================
          // ✅ NOISE SUPPRESSION - KEPT (light)
          // ============================================
          noiseSuppression: { ideal: true },
          googNoiseSuppression: true,
          
          // ============================================
          // ✅ AUTO GAIN - KEPT (for consistent volume)
          // ============================================
          autoGainControl: { ideal: true },
          googAutoGainControl: true,
          
          // ============================================
          // ✅ HIGH QUALITY + MAX VOLUME
          // ============================================
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          volume: 1.0, // FULL VOLUME
          latency: 0.01,
          googHighpassFilter: true, // Removes rumble only
        } 
      });
      
      console.log('✅ Mic ready! Echo Cancelled + Full Volume');
      console.log('🎵 Settings:', stream.getAudioTracks()[0].getSettings());
      
      setAudioQuality('hd');
      localStreamRef.current = stream;
      setMicReady(true);
      createPeerConnection(stream);
      
    } catch (err) {
      console.warn('⚠️ Advanced failed, trying basic...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            volume: 1.0,
          } 
        });
        
        console.log('✅ Basic mic ready');
        setAudioQuality('standard');
        localStreamRef.current = stream;
        setMicReady(true);
        createPeerConnection(stream);
        
      } catch (fallbackErr) {
        console.error('❌ Mic failed:', fallbackErr);
        setErrorMsg('Cannot access microphone: ' + fallbackErr.message);
        setStatus('error');
      }
    }
  };
  
  // ✅ Create Peer Connection - HIGH BITRATE
  const createPeerConnection = (stream) => {
    console.log('🔗 Creating peer connection...');
    const peer = new RTCPeerConnection(servers);
    
    stream.getTracks().forEach(track => {
      console.log('🎵 Track:', track.kind, track.getSettings());
      peer.addTrack(track, stream);
    });
    
    // Remote audio - FULL VOLUME
    peer.ontrack = (event) => {
      console.log('📞 Remote audio!');
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.volume = 1.0; // FULL VOLUME
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
    
    // ✅ HIGH BITRATE = CLEARER + LOUDER
    setTimeout(() => {
      try {
        const senders = peer.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 256000; // 256kbps HD
            params.encodings[0].priority = 'very-high';
            sender.setParameters(params);
            console.log('✅ Bitrate: 256kbps HD Audio');
          }
        });
      } catch (e) { console.log('⚠️ Bitrate:', e.message); }
    }, 1000);
    
    if (!isHost) {
      peer.createOffer({ offerToReceiveAudio: true, voiceActivityDetection: true })
        .then(offer => peer.setLocalDescription(offer))
        .then(() => { socket.emit("offer", { sdp: peer.localDescription, roomId }); setStatus('calling'); })
        .catch(err => console.error('❌ Offer:', err));
    } else {
      console.log('👑 Host waiting...');
    }
  };
  
  const cleanupAudio = () => {
    if (audioContextRef.current?.ctx) audioContextRef.current.ctx.close();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (peerRef.current) peerRef.current.close();
  };
  
  // Timer
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
      remoteAudioRef.current.volume = speakerOn ? 1.0 : 0.5;
      setSpeakerOn(!speakerOn);
    }
  };
  
  // ✅ Volume Boost
  const boostVolume = () => {
    if (remoteAudioRef.current) {
      if (!volumeBoosted) {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioContext();
          const source = ctx.createMediaElementSource(remoteAudioRef.current);
          const gainNode = ctx.createGain();
          gainNode.gain.value = 2.0; // 2x boost!
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          audioContextRef.current = { ctx, gainNode };
          console.log('🔊 Volume Boost ON (2x)');
        } catch (e) {
          remoteAudioRef.current.volume = 2.0;
        }
      } else {
        if (audioContextRef.current?.ctx) {
          audioContextRef.current.gainNode.gain.value = 1.0;
        }
        remoteAudioRef.current.volume = 1.0;
      }
      setVolumeBoosted(!volumeBoosted);
    }
  };
  
  const endCall = () => { cleanupAudio(); socket.emit("endCall", roomId); stopTimer(); navigate('/waiting?mode=call'); };
  const copyRoomCode = () => { navigator.clipboard.writeText(roomId).then(() => alert('Room code copied!')).catch(() => alert('Room Code: ' + roomId)); };
  const retryMic = () => { setStatus('waiting'); setErrorMsg(''); setMicReady(false); };
  
  return (
    <div className="call-room">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      <div className="call-room__container">
        {!micReady && status === 'waiting' && (
          <div className="call-room__echo-tip">🎧 <span>Use headphones for best quality & no echo!</span></div>
        )}
        
        <div className={`call-room__avatar ${status === 'connected' ? 'call-room__avatar--active' : ''}`}>
          <span>{isHost ? '📞' : '🎧'}</span>
        </div>
        
        <h2 className="call-room__name">{isHost ? 'Your Call Room' : 'Voice Call'}</h2>
        
        <div className="call-room__status">
          {!socketConnected && '🔌 Connecting...'}
          {socketConnected && status === 'waiting' && '🎙️ Ready'}
          {status === 'connecting' && '🎙️ Setting up...'}
          {status === 'calling' && '📞 Calling...'}
          {status === 'connected' && `📞 On call · ${formatDuration(callDuration)}`}
          {status === 'ended' && '🔴 Call Ended'}
          {status === 'error' && '❌ Error'}
        </div>
        
        {status === 'connected' && (
          <div className="call-room__quality">
            <span className="call-room__quality-dot"></span>
            {audioQuality === 'hd' ? 'HD Audio · Echo Cancelled' : 'Standard Audio'}
            {volumeBoosted && ' · 🔊 Boosted'}
          </div>
        )}
        
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
          <button onClick={startMic} className="call-room__start-btn">🎙️ Start Call</button>
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
            <button onClick={toggleMic} className={`call-room__ctrl ${micOn ? '' : 'call-room__ctrl--off'}`} title={micOn ? 'Mute' : 'Unmute'}>
              {micOn ? '🎤' : '🔇'}
            </button>
            <button onClick={toggleSpeaker} className={`call-room__ctrl ${speakerOn ? 'call-room__ctrl--active' : ''}`} title={speakerOn ? 'Speaker' : 'Earpiece'}>
              {speakerOn ? '🔊' : '📱'}
            </button>
            <button onClick={boostVolume} className={`call-room__ctrl ${volumeBoosted ? 'call-room__ctrl--active' : ''}`} title="Volume Boost">
              {volumeBoosted ? '🔊+' : '🔊'}
            </button>
            <button onClick={endCall} className="call-room__ctrl call-room__ctrl--end">🔴</button>
          </div>
        )}
        
        {status === 'ended' && (
          <div className="call-room__ended">
            <p>Call duration: {formatDuration(callDuration)}</p>
            <button onClick={() => navigate('/waiting?mode=call')} className="call-room__back-btn">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}