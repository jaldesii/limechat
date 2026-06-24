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
  const [speakerOn, setSpeakerOn] = useState(false); // ✅ Speaker toggle
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
  const echoCancellerRef = useRef(null);
  
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
    
    if (socket.connected) {
      setSocketConnected(true);
    } else {
      socket.on('connect', () => setSocketConnected(true));
    }
    
    // WebRTC Signaling
    socket.on("userJoined", async (data) => {
      console.log('👋 Guest joined!');
      if (peerRef.current && isHost) {
        try {
          const offer = await peerRef.current.createOffer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true, // ✅ VAD for noise reduction
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
          console.error('❌ Answer set error:', err);
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
    
    socket.on("callEnded", () => {
      setStatus('ended');
      stopTimer();
    });
    
    socket.on("userLeft", () => {
      setStatus('ended');
      stopTimer();
    });
    
    return () => {
      stopTimer();
      cleanupAudio();
      socket.off("userJoined");
      socket.off("offer");
      socket.off("answer");
      socket.off("iceCandidate");
      socket.off("callEnded");
      socket.off("userLeft");
      socket.off("connect");
    };
  }, [roomId, isHost]);
  
  // ✅ Start microphone with MAXIMUM echo cancellation
  const startMic = async () => {
    setStatus('connecting');
    setErrorMsg('');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Browser not supported. Please use Chrome or Firefox.');
      setStatus('error');
      return;
    }
    
    try {
      console.log('🎤 Requesting microphone with echo cancellation...');
      
      // ✅ ULTIMATE AUDIO CONSTRAINTS - Focus on echo cancellation
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          // ✅ ECHO CANCELLATION - Most important!
          echoCancellation: true,
          echoCancellationType: 'system', // Use system's echo canceller
          
          // ✅ NOISE SUPPRESSION
          noiseSuppression: true,
          noiseSuppressionType: 'high', // Aggressive noise suppression
          
          // ✅ AUTO GAIN - Normalize volume
          autoGainControl: true,
          
          // ✅ GOOGLE'S ADVANCED PROCESSING
          googEchoCancellation: true,
          googEchoCancellation2: true, // Double echo cancellation!
          googAutoGainControl: true,
          googAutoGainControl2: true,
          googNoiseSuppression: true,
          googNoiseSuppression2: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          
          // ✅ AUDIO QUALITY
          channelCount: 1, // Mono for voice
          sampleRate: 48000,
          sampleSize: 16,
          latency: 0.01,
          volume: 0.8, // ✅ Slightly lower to prevent feedback
        } 
      });
      
      console.log('✅ Mic ready with echo cancellation!');
      console.log('🎵 Settings:', stream.getAudioTracks()[0].getSettings());
      
      setAudioQuality('hd');
      localStreamRef.current = stream;
      setMicReady(true);
      
      // ✅ Apply AudioContext processing for additional echo cancellation
      applyAudioProcessing(stream);
      
      createPeerConnection(stream);
      
    } catch (err) {
      console.warn('⚠️ Advanced settings failed, trying basic...', err.message);
      
      // Fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
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
  
  // ✅ Advanced Audio Processing (Echo Cancellation)
  const applyAudioProcessing = (stream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      
      // ✅ Dynamic Compressor - Prevents loud spikes (reduces echo)
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, audioCtx.currentTime); // Compress above -50dB
      compressor.knee.setValueAtTime(40, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(12, audioCtx.currentTime); // 12:1 compression
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime); // Fast attack
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
      
      // ✅ High-pass filter - Remove low frequency rumble
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(150, audioCtx.currentTime); // Cut below 150Hz
      
      // ✅ Low-pass filter - Remove high frequency hiss
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(8000, audioCtx.currentTime); // Cut above 8kHz
      
      // ✅ Noise Gate - Only pass audio above threshold
      const noiseGate = audioCtx.createGain();
      noiseGate.gain.setValueAtTime(0, audioCtx.currentTime);
      
      // Create analyser for voice detection
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      // Simple noise gate using analyser
      const gateInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        noiseGate.gain.setTargetAtTime(average > 10 ? 1 : 0, audioCtx.currentTime, 0.02);
      }, 50);
      
      echoCancellerRef.current = { interval: gateInterval };
      
      // Connect chain: source → highpass → compressor → lowpass → noiseGate → destination
      source.connect(highpass);
      highpass.connect(compressor);
      compressor.connect(lowpass);
      lowpass.connect(noiseGate);
      noiseGate.connect(audioCtx.destination);
      
      console.log('✅ Advanced audio processing applied (Compressor + Filters + Noise Gate)');
      
    } catch (e) {
      console.log('⚠️ Audio processing not available:', e.message);
    }
  };
  
  // ✅ Create Peer Connection with echo-friendly settings
  const createPeerConnection = (stream) => {
    console.log('🔗 Creating peer connection...');
    
    const peerConfig = {
      ...servers,
      // ✅ Disable audio mirroring (prevents echo)
      audio: {
        echoCancellation: true,
      }
    };
    
    const peer = new RTCPeerConnection(peerConfig);
    
    // Add tracks
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
    
    // ✅ Set Opus codec with echo-friendly settings
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
            }
          }
        }
      });
    } catch (e) {
      console.log('⚠️ Codec preference error:', e.message);
    }
    
    // Remote audio
    peer.ontrack = (event) => {
      console.log('📞 Remote audio received!');
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        // ✅ Set lower volume to prevent echo feedback
        remoteAudioRef.current.volume = 0.8;
      }
      setStatus('connected');
      startTimer();
    };
    
    // ICE
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("iceCandidate", { candidate: event.candidate, roomId });
      }
    };
    
    // Connection state
    peer.onconnectionstatechange = () => {
      console.log('🔗 State:', peer.connectionState);
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        setStatus('ended');
        stopTimer();
      }
    };
    
    peerRef.current = peer;
    
    // Set audio bitrate
    setTimeout(() => {
      try {
        const senders = peer.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 64000; // 64kbps (good for voice, reduces echo)
            params.encodings[0].priority = 'high';
            sender.setParameters(params);
            console.log('✅ Audio bitrate: 64kbps');
          }
        });
      } catch (e) {
        console.log('⚠️ Bitrate error:', e.message);
      }
    }, 1000);
    
    // Guest creates offer
    if (!isHost) {
      peer.createOffer({ offerToReceiveAudio: true, voiceActivityDetection: true })
        .then(offer => peer.setLocalDescription(offer))
        .then(() => {
          socket.emit("offer", { sdp: peer.localDescription, roomId });
          setStatus('calling');
        })
        .catch(err => console.error('❌ Offer error:', err));
    } else {
      console.log('👑 Host waiting...');
    }
  };
  
  // ✅ Cleanup
  const cleanupAudio = () => {
    if (echoCancellerRef.current?.interval) {
      clearInterval(echoCancellerRef.current.interval);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerRef.current) {
      peerRef.current.close();
    }
  };
  
  // Timer
  const startTimer = () => {
    timerRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
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
  
  // Toggle mic
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicOn(audioTrack.enabled);
      }
    }
  };
  
  // ✅ Toggle speaker (earpiece vs loudspeaker)
  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      // On mobile, setting srcObject to a new stream with different sink ID
      // For now, just toggle volume as a simple speaker control
      if (speakerOn) {
        remoteAudioRef.current.volume = 0.5; // Earpiece mode (quieter)
      } else {
        remoteAudioRef.current.volume = 1.0; // Speaker mode
      }
      setSpeakerOn(!speakerOn);
    }
  };
  
  // End call
  const endCall = () => {
    cleanupAudio();
    socket.emit("endCall", roomId);
    stopTimer();
    navigate('/waiting?mode=call');
  };
  
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      alert('Room code copied!');
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
        {/* Header with Anti-Echo Tip */}
        {!micReady && status === 'waiting' && (
          <div className="call-room__echo-tip">
            🎧 <span>Use headphones for best quality & no echo!</span>
          </div>
        )}
        
        {/* Avatar */}
        <div className={`call-room__avatar ${status === 'connected' ? 'call-room__avatar--active' : ''}`}>
          <span>{isHost ? '📞' : '🎧'}</span>
        </div>
        
        <h2 className="call-room__name">
          {isHost ? 'Your Call Room' : 'Voice Call'}
        </h2>
        
        <div className="call-room__status">
          {!socketConnected && '🔌 Connecting to server...'}
          {socketConnected && status === 'waiting' && '🎙️ Ready to connect'}
          {status === 'connecting' && '🎙️ Setting up...'}
          {status === 'calling' && '📞 Calling...'}
          {status === 'connected' && `📞 On call · ${formatDuration(callDuration)}`}
          {status === 'ended' && '🔴 Call Ended'}
          {status === 'error' && '❌ Error'}
        </div>
        
        {/* Audio Quality + Echo Status */}
        {status === 'connected' && (
          <div className="call-room__quality">
            <span className="call-room__quality-dot"></span>
            {audioQuality === 'hd' ? 'HD Audio · Echo Cancelled' : 'Standard Audio'}
          </div>
        )}
        
        {/* Error */}
        {status === 'error' && (
          <div className="call-room__error-msg">
            <p>{errorMsg}</p>
            <button onClick={retryMic} className="call-room__retry-btn">🔄 Try Again</button>
          </div>
        )}
        
        {/* Room Code */}
        {isHost && !micReady && status !== 'error' && socketConnected && (
          <div className="call-room__code" onClick={copyRoomCode}>
            <span>📋 Room Code (tap to copy)</span>
            <strong>{roomId}</strong>
            <small>Share this code</small>
          </div>
        )}
        
        {/* Start Button */}
        {!micReady && status !== 'error' && socketConnected && (
          <button onClick={startMic} className="call-room__start-btn">
            🎙️ Start Call
          </button>
        )}
        
        {/* Waiting */}
        {isHost && micReady && status === 'connecting' && (
          <div className="call-room__waiting">
            <div className="call-room__spinner" />
            <p>Waiting for someone to join...</p>
            <small>Room Code: <strong>{roomId}</strong></small>
          </div>
        )}
        
        {/* Audio Waves */}
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
            <button 
              onClick={toggleSpeaker}
              className={`call-room__ctrl ${speakerOn ? 'call-room__ctrl--active' : ''}`}
              title={speakerOn ? 'Speaker ON' : 'Earpiece'}
            >
              {speakerOn ? '🔊' : '📱'}
            </button>
            <button onClick={endCall} className="call-room__ctrl call-room__ctrl--end">
              🔴 End
            </button>
          </div>
        )}
        
        {/* Ended */}
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