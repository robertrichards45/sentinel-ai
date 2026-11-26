// Offline stand-in used by tests (MOCK_PROVIDERS=true). Never calls the network.
export async function respond({ model, text, imageBase64, search, file, audio }) {
  return { text: `mock(${model}): ${text}${audio ? ` [audio ${audio.mime}]` : ''}${imageBase64 ? ' [image]' : ''}${file ? ` [file ${file.mime}]` : ''}${search ? ' [search]' : ''}`, usage: { in: 100, out: 20 }, sources: search ? [{ title: 'Example', url: 'https://example.com' }] : [] };
}
export async function transcribe({ mime }) {
  return { text: `mock transcript (${mime})`, usage: null, model: 'mock' };
}
export async function speak({ text, voice }) {
  // 0.1 s of silence as a real WAV so clients can test playback.
  const n = 2400, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return { audioBase64: b.toString('base64'), mime: 'audio/wav', model: `mock-tts(${voice}:${text.length})` };
}
export async function liveToken() { return { token: 'auth_tokens/mock-live-token', model: 'mock-live', expiresAt: new Date(Date.now() + 1800000).toISOString() }; }
