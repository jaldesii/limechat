import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import './CallRoom.scss';

// ── ML noise suppression (RNNoise) + noise gate ───────────────────────────
import {
  loadRnnoise,
  RnnoiseWorkletNode,
  NoiseGateWorkletNode,
} from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import noiseGateWorkletPath from '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url';

// ✅ Real SVG Icons (No Emojis!)
function MicOnIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>);}
function MicOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>);}
function SpeakerIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>);}
function SpeakerOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>);}
function PhoneOffIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>);}
function AudioWaveIcon() { return (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"><path d="M12 2v20M8 6v12M16 6v12M4 10v4M20 10v4"/></svg>);}

const HD_AUDIO_BITRATE = 96000;

function applyHDAudioSDP(sdp) {
  try {
    const lines = sdp.split('\r\n');
    let opusPayload = null;

    for (const line of lines) {
      const match = line.match(/^a=rtpmap:(\d+) opus\/48000/i);
      if (match) { opusPayload = match[1]; break; }
    }
    if (!opusPayload) return sdp;

    const hdParams = `stereo=0;sprop-stereo=0;maxaveragebitrate=${HD_AUDIO_BITRATE};maxplaybackrate=48000;sprop-maxcapturerate=48000;useinbandfec=1;usedtx=0;cbr=0`;
    let fmtpFound = false;

    const updated = lines.map((line) => {
      if (line.startsWith(`a=fmtp:${opusPayload}`)) {
        fmtpFound = true;
        return `${line};${hdParams}`;
      }
      return line;
    });

    if (!fmtpFound) {
      const rtpmapIndex = updated.findIndex((l) => l.startsWith(`a=rtpmap:${opusPayload}`));
      if (rtpmapIndex !== -1) {
        updated.splice(rtpmapIndex + 1, 0, `a=fmtp:${opusPayload} ${hdParams}`);
      }
    }

    return updated.join('\r\n');
  } catch (err) {
    console.warn('⚠️ SDP enhancement skipped:', err);
    return sdp;
  }
}

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
  const rawStreamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const rnnoiseNodeRef = useRef(null);
  const noiseGateNodeRef = useRef(null);
  const rnnoiseAssetsRef = useRef(null);
  const hasLeftRef = useRef(false);
  const connectionTimeoutRef = useRef(null);
  
 const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "8825922c875255b58f22d112",
        credential: "nqgOBZYxyPARuQWW",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "8825922c875255b58f22d112",
        credential: "nqgOBZYxyPARuQWW",
      },
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
    console.log('📍 CallRoom - Setting up call...');
    console.log('📍 RoomId:', roomId, 'isHost:', isHost);
    
    if (isAuto) {
      setTimeout(() => startMic(), 500);
    }
    
    socket.on("userJoined", async (data) => {
      console.log('👤 User joined, isHost:', isHost);
      if (peerRef.current && isHost) {
        try {
          setStatus('calling');
          const offer = await peerRef.current.createOffer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true,
          });
          offer.sdp = applyHDAudioSDP(offer.sdp);
          await peerRef.current.setLocalDescription(offer);
          socket.emit("offer", { sdp: offer, roomId });
          console.log('📤 Offer sent by host');
        } catch (err) {
          console.error('❌ Offer error:', err);
          setStatus('error');
          setErrorMsg('Failed to create call offer');
        }
      }
    });
    
    socket.on("callPartnerInfo", (data) => {
      console.log('📞 Partner info:', data);
      setPartnerName(data.name || 'Partner');
      setPartnerLocation(data.location || '');
    });
    
    socket.on("offer", async (data) => {
      console.log('📩 Offer received');
      if (peerRef.current) {
        try {
          setStatus('connecting');
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await peerRef.current.createAnswer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true,
          });
          answer.sdp = applyHDAudioSDP(answer.sdp);
          await peerRef.current.setLocalDescription(answer);
          socket.emit("answer", { sdp: answer, roomId });
          console.log('📤 Answer sent');
        } catch (err) {
          console.error('❌ Answer error:', err);
          setStatus('error');
          setErrorMsg('Failed to answer call');
        }
      }
    });
    
    socket.on("answer", async (data) => {
      console.log('📩 Answer received');
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log('✅ Remote description set');
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
          // Ignore ICE candidate errors
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
    
    // ✅ Send partner info
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    socket.emit('sendCallPartnerInfo', { 
      roomId, 
      name: user.name || 'Anonymous', 
      location: user.location || '' 
    });
    
    return () => {
      stopTimer();
      clearConnectionTimeout();
      cleanupAudio();
      socket.off("userJoined"); 
      socket.off("offer"); 
      socket.off("answer");
      socket.off("iceCandidate"); 
      socket.off("callEnded"); 
      socket.off("userLeft");
      socket.off("callPartnerInfo");
    };
  }, [roomId, isHost]);

  // ✅ Connection timeout management
  const clearConnectionTimeout = () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  const setConnectionTimeout = () => {
    clearConnectionTimeout();
    connectionTimeoutRef.current = setTimeout(() => {
      if (status !== 'connected') {
        console.warn('⚠️ Connection timeout');
        setStatus('error');
        setErrorMsg('Connection timeout. Please try again.');
      }
    }, 30000);
  };

  const ensureRnnoiseAssets = async () => {
    if (!rnnoiseAssetsRef.current) {
      rnnoiseAssetsRef.current = await loadRnnoise({
        url: rnnoiseWasmPath,
        simdUrl: rnnoiseWasmSimdPath,
      });
    }
    return rnnoiseAssetsRef.current;
  };

  const buildHDAudioChain = async (rawStream) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx({ sampleRate: 48000 });
    audioContextRef.current = audioContext;

    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => {});
    }

    let node = audioContext.createMediaStreamSource(rawStream);

    // --- ML noise suppression (RNNoise) ---------------------------------
    try {
      const wasmBinary = await ensureRnnoiseAssets();
      await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
      const rnnoise = new RnnoiseWorkletNode(audioContext, {
        wasmBinary,
        maxChannels: 1,
      });
      rnnoiseNodeRef.current = rnnoise;
      node.connect(rnnoise);
      node = rnnoise;
    } catch (err) {
      console.warn('⚠️ RNNoise unavailable:', err);
    }

    // --- Noise gate -------------------------------------------------------
    try {
      await audioContext.audioWorklet.addModule(noiseGateWorkletPath);
      const gate = new NoiseGateWorkletNode(audioContext, {
        openThreshold: -50,
        closeThreshold: -60,
        holdMs: 100,
        maxChannels: 1,
      });
      noiseGateNodeRef.current = gate;
      node.connect(gate);
      node = gate;
    } catch (err) {
      console.warn('⚠️ Noise gate unavailable:', err);
    }

    // --- Rumble/handling-noise cut ----------------------------------------
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;
    highpass.Q.value = 0.7;
    node.connect(highpass);

    // --- Gentle voice compressor ------------------------------------------
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    highpass.connect(compressor);

    // --- Makeup gain ------------------------------------------------------
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.4;
    compressor.connect(gainNode);

    // --- Limiter ----------------------------------------------------------
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    gainNode.connect(limiter);

    const destination = audioContext.createMediaStreamDestination();
    limiter.connect(destination);

    return destination.stream;
  };
  
  // ✅ Start mic - AUTO HD quality with noise cancellation
  const startMic = async () => {
    setStatus('connecting');
    setErrorMsg('');
    setConnectionTimeout();
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Browser not supported.');
      setStatus('error');
      clearConnectionTimeout();
      return;
    }
    
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
        } 
      });
      
      rawStreamRef.current = rawStream;
      const hdStream = await buildHDAudioChain(rawStream);
      localStreamRef.current = hdStream;
      createPeerConnection(hdStream);
      
    } catch (err) {
      console.warn('⚠️ HD audio setup failed, trying fallback:', err);
      try {
        const rawStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
          } 
        });
        rawStreamRef.current = rawStream;
        const hdStream = await buildHDAudioChain(rawStream);
        localStreamRef.current = hdStream;
        createPeerConnection(hdStream);
      } catch (fallbackErr) {
        console.error('❌ Mic access failed:', fallbackErr);
        setErrorMsg('Cannot access microphone.');
        setStatus('error');
        clearConnectionTimeout();
      }
    }
  };
  
  const createPeerConnection = (stream) => {
    console.log('🔧 Creating peer connection');
    const peer = new RTCPeerConnection(servers);
    
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
    
    peer.ontrack = (event) => {
      console.log('🎵 Remote track received');
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.volume = 1.0;
      }
      setStatus('connected');
      clearConnectionTimeout();
      startTimer();
    };
    
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("iceCandidate", { candidate: event.candidate, roomId });
      }
    };
    
    peer.onconnectionstatechange = () => {
      console.log('🔗 Connection state:', peer.connectionState);
      if (peer.connectionState === 'connected') {
        setStatus('connected');
        clearConnectionTimeout();
      }
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        setStatus('ended'); 
        stopTimer();
        clearConnectionTimeout();
      }
    };
    
    peer.oniceconnectionstatechange = () => {
      console.log('🧊 ICE state:', peer.iceConnectionState);
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        setStatus('connected');
        clearConnectionTimeout();
      }
      if (peer.iceConnectionState === 'failed') {
        setStatus('error');
        setErrorMsg('ICE connection failed. Please try again.');
        clearConnectionTimeout();
      }
    };
    
    peerRef.current = peer;
    
    // ✅ FIXED: Set encoder params with VALID enum values
    setTimeout(() => {
      try {
        const senders = peer.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = HD_AUDIO_BITRATE;
            // ✅ FIX: Use 'high' instead of 'very-high'
            params.encodings[0].priority = 'high';
            // ✅ Add networkPriority separately (valid values: 'very-low', 'low', 'medium', 'high')
            try {
              params.encodings[0].networkPriority = 'high';
            } catch (e) {
              // networkPriority might not be supported in all browsers
            }
            sender.setParameters(params).catch(err => {
              console.warn('⚠️ setParameters failed:', err.message);
            });
          }
        });
      } catch (e) {
        console.warn('⚠️ Encoder params error:', e.message);
      }
    }, 1000);
  };
  
  const cleanupAudio = () => {
    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach(t => t.stop());
      rawStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (rnnoiseNodeRef.current) {
      try { rnnoiseNodeRef.current.destroy(); } catch (e) {}
      try { rnnoiseNodeRef.current.disconnect(); } catch (e) {}
      rnnoiseNodeRef.current = null;
    }
    if (noiseGateNodeRef.current) {
      try { noiseGateNodeRef.current.disconnect(); } catch (e) {}
      noiseGateNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    clearConnectionTimeout();
  };
  
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
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    cleanupAudio(); 
    socket.emit("endCall", roomId); 
    stopTimer(); 
    navigate('/waiting?mode=call', { replace: true }); 
  };

  // ✅ Handle page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasLeftRef.current) {
        socket.emit("endCall", roomId);
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
          {status === 'connecting' && 'Connecting...'}
          {status === 'calling' && 'Calling...'}
          {status === 'connected' && formatDuration(callDuration)}
          {status === 'ended' && 'Call ended'}
          {status === 'error' && (
            <div className="call-room__error-status">
              <p>{errorMsg || 'Connection failed'}</p>
              <button onClick={() => {
                cleanupAudio();
                startMic();
              }} className="call-room__retry-btn">
                Reconnect
              </button>
            </div>
          )}
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
        {status === 'error' && !errorMsg.includes('Reconnect') && (
          <div className="call-room__error-msg">
            <p>{errorMsg}</p>
            <button onClick={startMic} className="call-room__retry-btn">Retry</button>
          </div>
        )}
        
        {/* Controls - 3 Buttons Only! */}
        {(status === 'connected' || status === 'calling' || status === 'connecting') && (
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
            <button onClick={() => navigate('/waiting?mode=call', { replace: true })} className="call-room__back-btn">
              Find New Partner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}