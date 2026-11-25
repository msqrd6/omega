let context;
let volume;
let noiseBuffer;
let muted = false;

function resumeAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!context) {
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    volume = context.createGain();
    volume.gain.value = muted ? 0 : 0.34;
    volume.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
}

export function initBattleAudio(button) {
  try {
    muted = localStorage.getItem('monolith-se-muted') === '1';
  } catch {}
  const updateButton = () => {
    button.textContent = muted ? 'SE OFF' : 'SE ON';
    button.setAttribute('aria-pressed', String(!muted));
  };
  updateButton();
  // Keep listening so audio can resume after a tab or device interruption.
  window.addEventListener('pointerdown', resumeAudio, { capture: true, passive: true });
  window.addEventListener('keydown', resumeAudio, { capture: true, passive: true });
  button.addEventListener('click', () => {
    muted = !muted;
    if (!muted) resumeAudio();
    if (volume) volume.gain.setTargetAtTime(muted ? 0 : 0.34, context.currentTime, 0.008);
    try {
      localStorage.setItem('monolith-se-muted', muted ? '1' : '0');
    } catch {}
    updateButton();
  });
}

function envelope(start, duration, peak) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  gain.connect(volume);
  return gain;
}

function voice(source, gain, start, duration) {
  source.connect(gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start(start);
  source.stop(start + duration);
}

function tone(type, from, to, start, duration, peak) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  voice(oscillator, envelope(start, duration, peak), start, duration);
}

function noise(start, duration, peak) {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.6), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  voice(source, envelope(start, duration, peak), start, duration);
}

export function playBattleSound(cue) {
  if (muted || !context || context.state === 'closed') return;
  const now = context.currentTime;
  switch (cue) {
    case 'select':
      tone('sine', 600, 900, now, 0.05, 0.24);
      break;
    case 'hit':
    case 'weakness':
      tone('sawtooth', 180, 55, now, 0.12, 0.5);
      if (cue === 'weakness') tone('triangle', 1200, 1200, now, 0.08, 0.28);
      break;
    case 'ult':
      tone('sine', 90, 220, now, 0.42, 0.58);
      tone('triangle', 880, 880, now + 0.12, 0.24, 0.25);
      tone('sine', 1320, 1320, now + 0.12, 0.3, 0.21);
      break;
    case 'defeat':
      noise(now, 0.25, 0.3);
      tone('triangle', 300, 40, now, 0.25, 0.48);
      break;
    case 'anchor':
      noise(now, 0.6, 0.72);
      tone('triangle', 145, 105, now + 0.6, 0.2, 0.5);
      tone('triangle', 145, 105, now + 0.88, 0.2, 0.5);
      break;
  }
}
