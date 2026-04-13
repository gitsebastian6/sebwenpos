'use client'

/**
 * POS Notification Sounds
 *
 * Generates pleasant short notification sounds using the Web Audio API.
 * No audio files needed — all sounds are synthesized on the fly.
 * Each call creates and destroys its own AudioContext to avoid browser
 * autoplay restrictions and resource leaks.
 */

/**
 * Plays a short click/pop sound when an item is added to the cart.
 * A quick percussive tap at ~800 Hz that fades out in ~80 ms.
 */
export function playCartAdd(): void {
  const ctx = new AudioContext()
  const now = ctx.currentTime

  // High-pitched short click
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.06)

  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.1)

  osc.onended = () => ctx.close()
}

/**
 * Plays a pleasant two-tone "cha-ching" ding when a sale is completed.
 * Two ascending sine tones (C5 → E5) with a soft tail.
 */
export function playSaleSuccess(): void {
  const ctx = new AudioContext()
  const now = ctx.currentTime

  // First tone — C5 (523 Hz)
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()

  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(523.25, now)

  gain1.gain.setValueAtTime(0.35, now)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)

  osc1.connect(gain1).connect(ctx.destination)
  osc1.start(now)
  osc1.stop(now + 0.35)

  // Second tone — E5 (659 Hz) slightly delayed
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()

  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(659.25, now + 0.1)

  gain2.gain.setValueAtTime(0.001, now)
  gain2.gain.setValueAtTime(0.35, now + 0.1)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

  osc2.connect(gain2).connect(ctx.destination)
  osc2.start(now + 0.1)
  osc2.stop(now + 0.5)

  osc2.onended = () => ctx.close()
}

/**
 * Plays a soft alert chime for new comanda items.
 * A gentle ascending triad (G4 → B4 → D5) with rounded sine waves.
 */
export function playAlert(): void {
  const ctx = new AudioContext()
  const now = ctx.currentTime

  const notes = [392, 493.88, 587.33] // G4, B4, D5
  const delay = 0.09

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = now + i * delay

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.25, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)

    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.25)

    // Close context after last note ends
    if (i === notes.length - 1) {
      osc.onended = () => ctx.close()
    }
  })
}

/**
 * Plays a short low buzz for validation errors.
 * A brief sawtooth drone at ~150 Hz that fades out quickly.
 */
export function playError(): void {
  const ctx = new AudioContext()
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(150, now)

  gain.gain.setValueAtTime(0.2, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

  // Low-pass filter to soften the harsh sawtooth
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(400, now)

  osc.connect(filter).connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.2)

  osc.onended = () => ctx.close()
}
