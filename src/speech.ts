import { state } from './state';

const SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberWords(value: number): string {
  const n = Math.max(0, Math.floor(value));
  if (n < 20) return SMALL[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens} ${SMALL[ones]}` : tens;
  }
  if (n < 200) {
    const rest = n - 100;
    return rest === 0 ? 'one hundred' : `one hundred ${numberWords(rest)}`;
  }
  return String(n);
}

export function speak(text: string, force = false): void {
  if (!force && !state.readAloud) return;
  try {
    const synth = window.speechSynthesis;
    const Ctor = window.SpeechSynthesisUtterance;
    if (!synth || !Ctor) return;
    const utterance = new Ctor(text);
    utterance.lang = 'en-GB';
    utterance.rate = 0.95;
    try {
      synth.cancel();
    } catch {
      /* A quiet voice is still fine. */
    }
    synth.speak(utterance);
  } catch {
    /* Reading aloud is optional. */
  }
}
