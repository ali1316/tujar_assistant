import { GoogleGenAI } from '@google/genai';

// Strictly use official Google Gemini API; ensure no freellmapi token or proxy is used
const rawKey = (process.env.GEMINI_API_KEY || '').trim();
const apiKey = rawKey.startsWith('freellmapi-') ? '' : rawKey;

if (rawKey.startsWith('freellmapi-')) {
  console.warn('[ai] Detected and ignored invalid freellmapi token in GEMINI_API_KEY. Please provide a valid Google Gemini API key.');
}

export const ai = new GoogleGenAI({ apiKey });
