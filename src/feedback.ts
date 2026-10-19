import { APP_VERSION } from './updates';
import { save, state, type Note } from './state';

export function feedbackUrl(): string {
  return import.meta.env.VITE_FEEDBACK_URL ?? '';
}

export function deviceString(): string {
  return `${navigator.userAgent} | ${window.innerWidth}x${window.innerHeight}`;
}

export function makeNote(type: Note['type'], note: string, screen: string): Note {
  return {
    id: crypto.randomUUID(),
    type,
    note: note.trim(),
    screen,
    version: APP_VERSION,
    device: deviceString(),
    timestamp: new Date().toISOString(),
  };
}

export function mailtoHref(note: Note): string {
  const subject = `Potato Region report – v${note.version} – ${note.screen}`;
  const body = [
    `Note: ${note.note}`,
    `Type: ${note.type}`,
    `Screen: ${note.screen}`,
    `Version: v${note.version}`,
    `Device: ${note.device}`,
    `Timestamp: ${note.timestamp}`,
  ].join('\n');
  return `mailto:gulcin.yildirim@clickhouse.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function postNote(note: Note): Promise<boolean> {
  const url = feedbackUrl();
  if (!url) return false;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
  return response.ok;
}

export async function storeNote(note: Note): Promise<'sent' | 'queued' | 'saved'> {
  state.feedback.unshift(note);
  const url = feedbackUrl();
  if (!url) {
    save();
    return 'saved';
  }
  if (!navigator.onLine) {
    state.feedbackQueue.push(note);
    save();
    return 'queued';
  }
  try {
    const ok = await postNote(note);
    if (!ok) throw new Error('not ok');
    save();
    return 'sent';
  } catch {
    state.feedbackQueue.push(note);
    save();
    return 'queued';
  }
}

export async function flushFeedback(): Promise<void> {
  const url = feedbackUrl();
  if (!url || !navigator.onLine || state.feedbackQueue.length === 0) return;
  const pending = state.feedbackQueue.splice(0);
  for (const note of pending) {
    try {
      const ok = await postNote(note);
      if (!ok) state.feedbackQueue.push(note);
    } catch {
      state.feedbackQueue.push(note);
    }
  }
  save();
}
