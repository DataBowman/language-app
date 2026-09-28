import * as Speech from 'expo-speech';

import type { TextToSpeech } from './types';

// expo-speech wraps the OS voices on native and speechSynthesis on the web, so one file serves both.
export const tts: TextToSpeech = {
  async hasSpanishVoice() {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.some((v) => v.language.toLowerCase().startsWith('es'));
  },
  speak(text, opts) {
    Speech.speak(text, { language: opts?.language ?? 'es', rate: opts?.rate ?? 0.9 });
  },
  stop: () => Speech.stop(),
};
