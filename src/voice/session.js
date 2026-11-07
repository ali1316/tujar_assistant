import { memoryBlock } from '../../memory.js';
import { historyBlock, chatStart, digestPending } from '../../history.js';
import { personaBlock } from '../../personas.js';
import { mintSecret, listVoices, toRealtimeTools, elevenReady, ELEVEN_MODEL } from '../../eleven.js';
import { ai } from '../ai.js';
import {
  MODEL,
  VOICE,
  NORA_VOICES,
  pickVoice,
  API_VERSION,
  LOCK_CONFIG,
  ELEVEN_PERSONA,
  ELEVEN_VOICE,
} from '../config.js';
import { activeDeclarations } from './declarations.js';
import { promptFor, buildSetup, screenBlock } from './prompt.js';

// توكن مؤقت لجلسة Gemini Live: يدعم GET و POST مع التوافق الكامل
export async function handleSession(req, res) {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط' });
  }

  const queryOrBody = { ...req.query, ...req.body };
  const apiVersion = queryOrBody.v || API_VERSION;
  const mode = queryOrBody.mode === 'mine' ? 'mine' : 'live';
  const voice = pickVoice(queryOrBody.voice);
  const persona = String(queryOrBody.persona || '');

  try {
    const [mem, hist, chatId, screen] = await Promise.all([
      memoryBlock(),
      historyBlock(),
      chatStart(),
      screenBlock(),
    ]);

    const sys = personaBlock(persona) + promptFor(mode) + screen + mem + hist;
    digestPending(chatId); // نراجع الجلسات السابقة اللي ما تراجعت (بالخلفية)

    const now = Date.now();
    const config = {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      httpOptions: { apiVersion },
    };

    if (LOCK_CONFIG) {
      config.liveConnectConstraints = {
        model: MODEL,
        config: {
          responseModalities: ['AUDIO'],
          ...(/extended-thinking/.test(MODEL)
            ? { thinkingConfig: { thinkingLevel: process.env.THINKING_LEVEL || 'medium' } }
            : {}),
          systemInstruction: sys,
          tools: [{ functionDeclarations: activeDeclarations() }],
        },
      };
    }

    const token = await ai.authTokens.create({ config });
    res.json({
      token: token.name,
      chatId,
      apiVersion,
      mode,
      voice,
      setup: buildSetup(mode, voice, sys),
    });
  } catch (e) {
    console.error('token error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

// المحرك الثاني: ElevenLabs Eleven Realtime
export async function handleElevenSession(req, res) {
  if (!elevenReady()) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY غير مضبوط في Render' });
  }

  const queryOrBody = { ...req.query, ...req.body };
  try {
    const [mem, hist, chatId, screen] = await Promise.all([
      memoryBlock(),
      historyBlock(),
      chatStart(),
      screenBlock(),
    ]);

    const name = ELEVEN_PERSONA;
    const persona = `【هوية هذه الجلسة — تتقدّم على أي وصف قبلها】 اسمك «${name}»، المساعد الذكي (ذكر). كل مكان في التعليمات يقول «نورة» أو يخاطبك بصيغة المؤنث = أنت ${name} بصيغة المذكر.
ولو أحد سألك مين أنت قل: أنا ${name}.
ذكريات وسجل «نورة» تحت هي ذكرياتك أنت.\n\n`;

    const style = `\n\n【أسلوب الرد — مهم جداً】
- خلّ طول الرد على قد السؤال: سؤال سريع أو رقم → جملة أو جملتين بالجواب مباشرة. طلب شرح أو تحليل → فصّل بنقاط مرتبة بالكلام. نقاش أو رأي → تفاعل مع فكرته، وأعطه رأيك وسبب، واسأل سؤال واحد بس لو فعلاً يفيد.
- ابدأ بالجواب نفسه، بدون مقدمات أو ترحيب متكرر («يا هلا والله» مرة وحدة بس في أول الجلسة).
- لا تختم كل رد بعرض «تبغى أسوي لك…؟» — اعرض خطوة جاية بس لما تكون مفيدة وواضحة.
- طابق نبرة فواز: لو مستعجل اختصر، لو يمزح تفاعل بخفة، لو جاد كن مركّز ومهني.
- الأرقام قلها بالكلام الطبيعي، وبدون إنجليزي وسط الجملة إلا اسم شي ما له مقابل.`;

    const sys = persona + promptFor('live') + screen + mem + hist + style;
    digestPending(chatId);

    const voice = String(queryOrBody.voice || ELEVEN_VOICE).slice(0, 64) || undefined;
    const tools = toRealtimeTools(activeDeclarations());
    const s = await mintSecret({ instructions: sys, tools, voice });
    console.log(`[eleven] session chat #${chatId} model=${s.model} voice=${voice || '-'} tools=${tools.length}`);

    res.json({
      secret: s.secret,
      model: s.model,
      chatId,
      voice,
      url: `wss://api.elevenlabs.io/v1/convai/realtime?model=${s.model}`,
    });
  } catch (e) {
    console.error('[eleven] session error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

// قائمة أصوات ElevenLabs المتاحة
export async function handleElevenVoices(req, res) {
  if (!elevenReady()) return res.json({ ready: false, voices: [] });
  try {
    res.json({
      ready: true,
      model: ELEVEN_MODEL(),
      default: ELEVEN_VOICE,
      voices: await listVoices(),
    });
  } catch (e) {
    res.status(500).json({ ready: true, error: e.message, voices: [] });
  }
}

// قائمة أصوات نورة
export function handleVoices(req, res) {
  res.json({ voices: NORA_VOICES, default: VOICE });
}
