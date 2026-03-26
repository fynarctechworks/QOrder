import { useCallback, useRef } from 'react';

type SoundType = 'newOrder' | 'payment' | 'serviceRequest' | 'kitchenReady' | 'leaveRequest' | 'stockLow' | 'stockOut' | 'staffLate' | 'staffEarlyCheckout';

/**
 * Synthesized notification sounds using Web Audio API — no sound files needed.
 * Each event type has a distinct tone pattern so staff can identify by ear.
 */
const SOUND_CONFIG: Record<SoundType, { freqs: number[]; durations: number[]; type: OscillatorType }> = {
  // Double ascending ding — high urgency
  newOrder: { freqs: [880, 1100], durations: [0.15, 0.35], type: 'sine' },
  // Triple soft chime — money-related
  payment: { freqs: [660, 880, 1100], durations: [0.12, 0.12, 0.3], type: 'sine' },
  // Two-tone alert bell — attention needed
  serviceRequest: { freqs: [780, 1040], durations: [0.2, 0.3], type: 'triangle' },
  // Single bright ping — informational
  kitchenReady: { freqs: [1200], durations: [0.25], type: 'sine' },
  // Gentle two-tone chime — staff request
  leaveRequest: { freqs: [520, 780], durations: [0.2, 0.3], type: 'sine' },
  // Urgent low descending alarm — stock warning
  stockLow: { freqs: [880, 660, 440], durations: [0.15, 0.15, 0.3], type: 'triangle' },
  // Rapid triple alarm — ingredient completely out
  stockOut: { freqs: [440, 880, 440], durations: [0.12, 0.12, 0.25], type: 'square' },
  // Two-tone alert — staff late
  staffLate: { freqs: [600, 900], durations: [0.2, 0.3], type: 'triangle' },
  // Descending two-tone — early checkout
  staffEarlyCheckout: { freqs: [900, 500], durations: [0.2, 0.3], type: 'triangle' },
};

function playSound(soundType: SoundType) {
  try {
    const ctx = new AudioContext();
    const config = SOUND_CONFIG[soundType];
    let offset = 0;

    config.freqs.forEach((freq, i) => {
      const dur = config.durations[i] ?? 0.2;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = config.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + offset + dur);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + dur + 0.05);
      offset += dur;
    });
  } catch {
    /* AudioContext not available (e.g. SSR or restricted browser) */
  }
}

export function useNotificationSound() {
  // Throttle: prevent the same sound type from firing more than once per 2 seconds
  const lastPlayed = useRef<Record<string, number>>({});

  const play = useCallback((type: SoundType) => {
    const now = Date.now();
    if (now - (lastPlayed.current[type] || 0) < 2000) return;
    lastPlayed.current[type] = now;
    playSound(type);
  }, []);

  return { play };
}
