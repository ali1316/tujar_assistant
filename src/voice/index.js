import { Router } from 'express';
import {
  handleSession,
  handleElevenSession,
  handleElevenVoices,
  handleVoices,
} from './session.js';
import { handleSpeak, handleSpeakEleven } from './tts.js';

const router = Router();

// جلسات ومفاتيح المحادثة الصوتية
router.get('/api/session', handleSession);
router.post('/api/session', handleSession);

// ElevenLabs realtime session
router.get('/api/eleven/session', handleElevenSession);
router.get('/api/eleven/voices', handleElevenVoices);

// أصوات نورة
router.get('/api/voices', handleVoices);

// تحويل النص إلى صوت (TTS)
router.post('/api/speak', handleSpeak);
router.post('/api/speak/eleven', handleSpeakEleven);

export { router as voiceRouter };
export { handleSession, handleElevenSession, handleElevenVoices, handleVoices } from './session.js';
export { handleSpeak, handleSpeakEleven } from './tts.js';
