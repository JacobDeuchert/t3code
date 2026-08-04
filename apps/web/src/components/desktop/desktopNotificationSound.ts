export type DesktopNotificationSoundKind = "complete" | "attention";

let audioContext: AudioContext | null = null;

function playTone(context: AudioContext, frequency: number, start: number, duration: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.07, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function playDesktopNotificationSound(kind: DesktopNotificationSoundKind): void {
  try {
    audioContext ??= new AudioContext();
    const context = audioContext;
    void context
      .resume()
      .then(() => {
        const now = context.currentTime + 0.01;
        if (kind === "complete") {
          playTone(context, 523.25, now, 0.18);
          playTone(context, 659.25, now + 0.12, 0.24);
          return;
        }
        playTone(context, 783.99, now, 0.14);
        playTone(context, 783.99, now + 0.18, 0.14);
      })
      .catch(() => undefined);
  } catch {
    // Audio output is best effort; notification delivery must continue.
  }
}
