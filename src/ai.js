import { GoogleGenAI } from '@google/genai';

// Clean out legacy proxy variables
delete process.env.FREELLMAPI_BASE_URL;
delete process.env.FREELLMAPI_API_KEY;

// Sanitize keys: ignore freellmapi, dummy zeros, or invalid placeholder tokens
function cleanKey(val) {
  const k = (val || '').trim();
  if (!k || k.startsWith('freellmapi-') || /^0+$/.test(k) || k === 'your_gemini_api_key_here') return '';
  return k;
}

const geminiKey = cleanKey(process.env.GEMINI_API_KEY);
const googleKey = cleanKey(process.env.GOOGLE_API_KEY);
const apiKey = geminiKey || googleKey || '';

if (apiKey) {
  process.env.GEMINI_API_KEY = apiKey;
  process.env.GOOGLE_API_KEY = apiKey;
} else {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  console.warn('[ai] No valid Google Gemini API key configured.');
}

export const ai = new GoogleGenAI({ apiKey });
