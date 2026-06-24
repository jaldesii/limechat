import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import './CallRoom.scss';

// ── ML noise suppression (RNNoise) + noise gate ───────────────────────────
// npm i @sapphi-red/web-noise-suppressor
//
// These four imports use Vite's `?url` suffix, which resolves to the static
// asset path at build time. If you're NOT on Vite (CRA/webpack), delete these
// four import lines and instead:
//   1) copy these 4 files from node_modules/@sapphi-red/web-noise-suppressor/
//      into your public folder, e.g. public/audio-worklets/
//        - rnnoiseWorklet.js
//        - rnnoise.wasm
//        - rnnoise_simd.wasm
//        - noiseGateWorklet.js
//   2) replace the const below with plain string paths, e.g.
//        const rnnoiseWorkletPath = '/audio-worklets/rnnoiseWorklet.js';
//   3) Note: AudioWorklet requires a secure context (https:// or localhost).
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

// HD voice target bitrate. 64-96kbps mono is already transparent for speech;
// pushing past ~128kbps mono buys you nothing audible, just wastes bandwidth
// on bad connections. Kept as one constant so the SDP munging and the
// RTCRtpSender encoding params can never drift out of sync with each other.
const HD_AUDIO_BITRATE = 96000;

// ✅ HD AUDIO — forces Opus into high-bitrate, FEC-protected, VBR mode via SDP.
// setParameters() alone only caps bandwidth; this actually tells the codec
// to target a real bitrate floor regardless of the browser's BWE guess.
function applyHDAudioSDP(sdp) {
  try {
    const lines = sdp.split('\r\n');
    let opusPayload = null;

    for (const line of lines) {
      const match = line.match(/^a=rtpmap:(\d+) opus\/48000/i);
      if (match) { opusPayload = match[1]; break; }
    }
    if (!opusPayload) return sdp;

    // mono (matches channelCount:1 capture) · FEC for packet-loss resilience
    // · DTX off so quality doesn't dip in pauses · fullband, no artificial
    // lowpass — that cut belongs in the local pre-processing chain (or not
    // at all), never in the codec negotiation itself.
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
  const localStreamRef = useRef(null); // processed (HD) stream — sent over the wire
  const rawStreamRef = useRef(null);   // raw mic stream — needs its own cleanup
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const rnnoiseNodeRef = useRef(null);   // holds wasm memory — must call .destroy()
  const noiseGateNodeRef = useRef(null);
  const rnnoiseAssetsRef = useRef(null); // cached wasm binary so reconnects don't refetch
  
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
          offer.sdp = applyHDAudioSDP(offer.sdp);
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
          answer.sdp = applyHDAudioSDP(answer.sdp);
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

  // Loads the RNNoise wasm binary once and caches it on the ref — re-running
  // startMic() (e.g. after "Retry") shouldn't re-download ~150KB of wasm.
  const ensureRnnoiseAssets = async () => {
    if (!rnnoiseAssetsRef.current) {
      rnnoiseAssetsRef.current = await loadRnnoise({
        url: rnnoiseWasmPath,
        simdUrl: rnnoiseWasmSimdPath,
      });
    }
    return rnnoiseAssetsRef.current;
  };

  // ✅ The actual "ultra" processing chain:
  //   mic → RNNoise (ML denoise) → noise gate (mops up residual hiss/hum
  //   between words) → highpass (rumble/handling noise) → gentle compressor
  //   (evens levels) → makeup gain → limiter (brick-wall, guarantees no
  //   clipping) → destination stream, which is what actually goes over the
  //   wire.
  //
  // Deliberately NOT lowpass-filtering here: cutting above 8kHz (like the
  // old version did) throws away exactly the detail Opus fullband is
  // negotiated to carry. That's the opposite of "HD."
  const buildHDAudioChain = async (rawStream) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx({ sampleRate: 48000 });
    audioContextRef.current = audioContext;

    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => {});
    }

    let node = audioContext.createMediaStreamSource(rawStream);

    // --- ML noise suppression (RNNoise) ---------------------------------
    // This is the real upgrade over filters: a small neural net trained to
    // tell voice apart from fans/AC/traffic/keyboard noise, frame by frame.
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
      console.warn('⚠️ RNNoise unavailable (check AudioWorklet/HTTPS + asset paths), continuing without ML denoise:', err);
    }

    // --- Noise gate -------------------------------------------------------
    // Cleans up whatever low-level hum/hiss RNNoise leaves between words.
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

    // --- Rumble/handling-noise cut (kept gentle, no high-end cut) ---------
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;
    highpass.Q.value = 0.7;
    node.connect(highpass);

    // --- Gentle voice compressor (evens out volume swings, doesn't pump) --
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    highpass.connect(compressor);

    // --- Makeup gain (~+3dB) ----------------------------------------------
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.4;
    compressor.connect(gainNode);

    // --- Limiter: brick-wall safety net so loud talkers / makeup gain
    // never clip the signal before it hits the encoder. This is what the
    // original chain was missing. ------------------------------------------
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
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Browser not supported.');
      setStatus('error');
      return;
    }
    
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: { ideal: true }, // keep native AEC — it has the
                                               // playback-loopback reference
                                               // RNNoise doesn't have
          noiseSuppression: false,            // RNNoise replaces this —
                                               // stacking both makes voice
                                               // sound over-processed/robotic
          autoGainControl: false,             // our own compressor/limiter
                                               // gives more controlled,
                                               // consistent leveling
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
    
    // Mirrors the SDP fmtp ceiling so the encoder never gets capped lower
    // than what we negotiated, regardless of the browser's bandwidth guess.
    setTimeout(() => {
      try {
        const senders = peer.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = HD_AUDIO_BITRATE;
            params.encodings[0].priority = 'very-high';
            sender.setParameters(params);
          }
        });
      } catch (e) {}
    }, 1000);
    
    if (!isHost) {
      peer.createOffer({ offerToReceiveAudio: true, voiceActivityDetection: true })
        .then(offer => {
          offer.sdp = applyHDAudioSDP(offer.sdp);
          return peer.setLocalDescription(offer);
        })
        .then(() => { socket.emit("offer", { sdp: peer.localDescription, roomId }); setStatus('calling'); })
        .catch(err => console.error('❌ Offer:', err));
    }
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
      try { rnnoiseNodeRef.current.destroy(); } catch (e) {} // frees wasm memory
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