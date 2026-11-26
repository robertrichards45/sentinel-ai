// Offline stand-in used by tests (MOCK_PROVIDERS=true). Never calls the network.
export async function respond({ model, text, imageBase64, search }) {
  return { text: `mock(${model}): ${text}${imageBase64 ? ' [image]' : ''}${search ? ' [search]' : ''}`, usage: { in: 100, out: 20 }, sources: search ? [{ title: 'Example', url: 'https://example.com' }] : [] };
}
export async function transcribe({ mime }) {
  return { text: `mock transcript (${mime})`, usage: null, model: 'mock' };
}
