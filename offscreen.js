let audioContext;

function playGentleChime(volume = 0.35) {
  const AudioContextClass = self.AudioContext || self.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ||= new AudioContextClass();
  const vol = Math.max(0, Math.min(1, Number(volume) || 0.35));
  if (vol <= 0) return;

  const now = audioContext.currentTime + 0.03;
  const master = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, now);
  master.gain.setValueAtTime(vol * 0.22, now);
  filter.connect(master).connect(audioContext.destination);

  // Warm soft marimba/kalimba-like two-note interval (C5 -> E5)
  for (const [offset, freq, dur] of [[0, 523.25, 0.32], [0.14, 659.25, 0.42]]) {
    const osc = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc2.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + offset);
    osc2.frequency.setValueAtTime(freq * 2, now + offset);

    const subGain = audioContext.createGain();
    subGain.gain.setValueAtTime(0.18, now + offset);

    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.linearRampToValueAtTime(0.9, now + offset + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);

    osc.connect(gain);
    osc2.connect(subGain).connect(gain);
    gain.connect(filter);

    osc.start(now + offset);
    osc2.start(now + offset);
    osc.stop(now + offset + dur + 0.02);
    osc2.stop(now + offset + dur + 0.02);
  }
}

function playSound(options = {}) {
  const vol = Math.max(0, Math.min(1, Number(options.volume ?? 0.35)));
  if (vol <= 0) return;
  const custom = options.customSoundDataUrl;
  if (typeof custom === "string" && custom.startsWith("data:audio/")) {
    try {
      const audio = new Audio(custom);
      audio.volume = vol;
      audio.play().catch(() => playGentleChime(vol));
      return;
    } catch {
      // Fallback to default chicken sound
    }
  }
  try {
    const defaultAudio = new Audio(chrome.runtime.getURL("assets/pipoca-cluck.mp3"));
    defaultAudio.volume = vol;
    defaultAudio.play().catch(() => playGentleChime(vol));
    return;
  } catch {
    playGentleChime(vol);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "pipoca:play-chime") {
    playSound({ volume: message.volume, customSoundDataUrl: message.customSoundDataUrl });
  }
});
