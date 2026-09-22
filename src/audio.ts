// Microphone capture and playback for the two audio models. MediaRecorder gives
// a compressed blob; decodeAudioData turns it into PCM at the device's native
// rate, and the SDKs resample from there.

export interface Recording { samples: Float32Array; sampleRate: number; durationSec: number }

let ctx: AudioContext | null = null;
export const audioContext = () => (ctx ??= new AudioContext());

export interface Recorder { stop(): void; done: Promise<Recording> }

export async function record(maxSeconds: number, onTick?: (elapsed: number) => void): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(isSecureContext ? "This browser has no microphone API." : "Microphone needs HTTPS (or localhost). Open the deployed HTTPS URL.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const started = performance.now();
  const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start();
  const tick = window.setInterval(() => onTick?.((performance.now() - started) / 1000), 100);
  const timer = window.setTimeout(() => stop(), maxSeconds * 1000);
  function stop() { clearTimeout(timer); clearInterval(tick); if (rec.state !== "inactive") rec.stop(); }
  const done = stopped.then(async () => {
    stream.getTracks().forEach((t) => t.stop());
    const bytes = await new Blob(chunks, { type: rec.mimeType }).arrayBuffer();
    const decoded = await audioContext().decodeAudioData(bytes);
    return { samples: mono(decoded), sampleRate: decoded.sampleRate, durationSec: decoded.duration };
  });
  return { stop, done };
}

function mono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  return out;
}

let playing: AudioBufferSourceNode | null = null;
export function play(samples: Float32Array, sampleRate: number, onEnded?: () => void) {
  stopPlayback();
  const c = audioContext();
  const buf = c.createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = c.createBufferSource();
  src.buffer = buf; src.connect(c.destination);
  src.onended = () => { if (playing === src) playing = null; onEnded?.(); };
  src.start(); playing = src;
}
export function stopPlayback() { try { playing?.stop(); } catch { /* not started */ } playing = null; }

/** 16-bit PCM WAV, for the download button. */
export function toWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: "audio/wav" });
}

export function rms(samples: Float32Array): number {
  let s = 0; for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / Math.max(1, samples.length));
}
