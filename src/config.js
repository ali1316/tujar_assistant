// Configuration and environment variables
export const PORT = process.env.PORT || 3000;
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-live';
export const VOICE = process.env.GEMINI_VOICE || 'Sulafat'; // صوت نورة الافتراضي

// أصوات نسائية جاهزة يدعمها Live (نختار منها لنورة)
export const NORA_VOICES = [
  'Sulafat', 'Despina', 'Aoede', 'Leda', 'Kore', 'Zephyr',
  'Achernar', 'Callirrhoe', 'Autonoe', 'Erinome', 'Laomedeia',
  'Gacrux', 'Pulcherrima', 'Vindemiatrix'
];

export const pickVoice = v => (NORA_VOICES.includes(v) ? v : VOICE);
export const API_VERSION = process.env.GEMINI_API_VERSION || 'v1alpha';
export const LOCK_CONFIG = process.env.LOCK_CONFIG !== 'false';
export const ALLOW_WRITES = process.env.ALLOW_WRITES !== 'false';
export const ACCESS_CODE = process.env.ACCESS_CODE || ''; // لو فاضي = بدون رمز (للتجربة المحلية)
export const MY_VOICE_ID = process.env.MY_VOICE_ID || 'voice_xb1ye60p9o3i'; // صوت فواز المستنسخ في Gemini
export const TTS_MODEL = process.env.TTS_MODEL || 'gemini-3.8-flash-tts';
export const THINKING_LEVEL = process.env.THINKING_LEVEL || 'medium';
export const ELEVEN_PERSONA = process.env.ELEVEN_PERSONA || 'فواز';
export const ELEVEN_VOICE = process.env.ELEVEN_VOICE || '';
