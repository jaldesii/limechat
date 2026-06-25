// ── Shared HD audio pipeline ───────────────────────────────────────────────
// Used by BOTH CallRoom (1:1) and GroupCallRoom (mesh) so every voice call
// in the app gets *identical* processing and *identical* codec negotiation.
// Tune a constant here once, and every call type picks it up.
//
// npm i @sapphi-red/web-noise-suppressor
//
// These four imports use Vite's `?url` suffix, which resolves to the static
// asset path at build time. If you're NOT on Vite (CRA/webpack), delete
// these four import lines and instead:
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

// HD voice target bitrate. 64-96kbps mono is already transparent for
// speech; pushing past ~128kbps mono buys you nothing audible, just wastes
// bandwidth on bad connections.
export const HD_AUDIO_BITRATE = 96000;

// getUserMedia constraints shared by every call type.
export const HD_MIC_CONSTRAINTS = {
  audio: {
    echoCancellation: { ideal: true }, // keep native AEC — it has the
                                        // playback-loopback reference
                                        // RNNoise doesn't have
    noiseSuppression: false,           // RNNoise replaces this — stacking
                                        // both makes voice sound
                                        // over-processed/robotic
    autoGainControl: false,            // our own compressor/limiter gives
                                        // more controlled, consistent leveling
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
  },
};

// Looser fallback for browsers/devices that reject the constraint object above.
export const HD_MIC_CONSTRAINTS_FALLBACK = {
  audio: {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
  },
};

// ✅ HD AUDIO — forces Opus into high-bitrate, FEC-protected, VBR mode via SDP.
// setParameters() alone only caps bandwidth; this actually tells the codec
// to target a real bitrate floor regardless of the browser's BWE guess.
export function applyHDAudioSDP(sdp) {
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

// Module-level cache: the RNNoise wasm binary is fetched once per page
// load no matter how many calls/group calls happen, and no matter how
// many peer connections a single call opens (1 for 1:1, N-1 for a mesh
// group call) — they all share this one promise.
let rnnoiseAssetsPromise = null;
function ensureRnnoiseAssets() {
  if (!rnnoiseAssetsPromise) {
    rnnoiseAssetsPromise = loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseWasmSimdPath,
    });
  }
  return rnnoiseAssetsPromise;
}

// ✅ The actual "ultra" processing chain:
//   mic → RNNoise (ML denoise) → noise gate (mops up residual hiss/hum
//   between words) → highpass (rumble/handling noise) → gentle compressor
//   (evens levels) → makeup gain → limiter (brick-wall, guarantees no
//   clipping) → destination stream.
//
// IMPORTANT: this runs ONCE per call, producing ONE processed local
// stream. For a group call, the same stream's track gets added to every
// peer connection in the mesh — every participant hears the exact same
// processed audio, there's no per-peer reprocessing.
//
// Deliberately NOT lowpass-filtering: cutting above 8kHz throws away
// exactly the detail Opus fullband is negotiated to carry.
export async function buildHDAudioChain(rawStream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioCtx({ sampleRate: 48000 });

  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => {});
  }

  let node = audioContext.createMediaStreamSource(rawStream);
  let rnnoiseNode = null;
  let noiseGateNode = null;

  // --- ML noise suppression (RNNoise) -----------------------------------
  try {
    const wasmBinary = await ensureRnnoiseAssets();
    await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
    rnnoiseNode = new RnnoiseWorkletNode(audioContext, { wasmBinary, maxChannels: 1 });
    node.connect(rnnoiseNode);
    node = rnnoiseNode;
  } catch (err) {
    console.warn('⚠️ RNNoise unavailable (check AudioWorklet/HTTPS + asset paths), continuing without ML denoise:', err);
  }

  // --- Noise gate ---------------------------------------------------------
  try {
    await audioContext.audioWorklet.addModule(noiseGateWorkletPath);
    noiseGateNode = new NoiseGateWorkletNode(audioContext, {
      openThreshold: -50,
      closeThreshold: -60,
      holdMs: 100,
      maxChannels: 1,
    });
    node.connect(noiseGateNode);
    node = noiseGateNode;
  } catch (err) {
    console.warn('⚠️ Noise gate unavailable:', err);
  }

  // --- Rumble/handling-noise cut (kept gentle, no high-end cut) ----------
  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 85;
  highpass.Q.value = 0.7;
  node.connect(highpass);

  // --- Gentle voice compressor --------------------------------------------
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;
  highpass.connect(compressor);

  // --- Makeup gain (~+3dB) -------------------------------------------------
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 1.4;
  compressor.connect(gainNode);

  // --- Limiter: brick-wall safety net -------------------------------------
  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  gainNode.connect(limiter);

  const destination = audioContext.createMediaStreamDestination();
  limiter.connect(destination);

  return { stream: destination.stream, audioContext, rnnoiseNode, noiseGateNode };
}

// Mirrors the SDP fmtp ceiling on the actual RTCRtpSender so the encoder
// never gets capped lower than what was negotiated. Call once per
// RTCPeerConnection, right after tracks are added — for a group call
// that means once per peer in the mesh, all with the same ceiling.
export function applyHDSenderParams(peer) {
  setTimeout(() => {
    try {
      peer.getSenders().forEach((sender) => {
        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = HD_AUDIO_BITRATE;
          params.encodings[0].priority = 'very-high';
          sender.setParameters(params).catch(() => {});
        }
      });
    } catch (e) {}
  }, 1000);
}

// Tears down everything getUserMedia + buildHDAudioChain produced.
// Does NOT close any RTCPeerConnections — callers manage those themselves
// since a group call may have several.
export function cleanupHDAudioChain({ rawStream, processedStream, audioContext, rnnoiseNode, noiseGateNode }) {
  if (rawStream) rawStream.getTracks().forEach((t) => t.stop());
  if (processedStream) processedStream.getTracks().forEach((t) => t.stop());
  if (rnnoiseNode) {
    try { rnnoiseNode.destroy(); } catch (e) {} // frees wasm memory
    try { rnnoiseNode.disconnect(); } catch (e) {}
  }
  if (noiseGateNode) {
    try { noiseGateNode.disconnect(); } catch (e) {}
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
  }
}