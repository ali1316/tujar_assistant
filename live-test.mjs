// اختبار حقيقي بدون متصفح: يمر بنفس المسار (توكن مؤقت → WebSocket → toolCall → الداتابيس → رد صوتي)
// node live-test.mjs "سؤالك هنا"   (السيرفر لازم يكون شغال: npm start)
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:3000';
const question = process.argv[2] || 'هلا، وش وضع المشاريع المتأخرة عندنا؟ وكم تذكرة مفتوحة عليها؟';

const s = await (await fetch(`${BASE}/api/session`)).json();
if (s.error) { console.error('❌', s.error); process.exit(1); }
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${s.apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${s.token}`;
const ws = new WebSocket(url);
const audio = []; let said = ''; const t0 = Date.now(); let firstAudio;

ws.onopen = () => ws.send(JSON.stringify({ setup: s.setup }));
ws.onmessage = async ev => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString());
  if (msg.setupComplete) {
    console.log(`✅ setup OK (${s.setup.model}, ${s.apiVersion})\n👤 ${question}`);
    ws.send(JSON.stringify({ realtimeInput: { text: question } }));
  }
  if (msg.toolCall) {
    const functionResponses = [];
    for (const fc of msg.toolCall.functionCalls) {
      const result = await (await fetch(`${BASE}/api/tools/${fc.name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fc.args || {}),
      })).json();
      console.log(`🔧 ${fc.name}(${JSON.stringify(fc.args || {})}) → ${JSON.stringify(result).slice(0, 150)}`);
      functionResponses.push({ id: fc.id, name: fc.name, response: { result } });
    }
    ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
  }
  const sc = msg.serverContent;
  for (const p of sc?.modelTurn?.parts || []) if (p.inlineData) { firstAudio ??= Date.now() - t0; audio.push(Buffer.from(p.inlineData.data, 'base64')); }
  if (sc?.outputTranscription?.text) said += sc.outputTranscription.text;
  if (sc?.turnComplete) {
    const pcm = Buffer.concat(audio);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28);
    h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync('reply.wav', Buffer.concat([h, pcm]));
    console.log(`🤖 ${said}\n🔊 reply.wav (${(pcm.length / 48000).toFixed(1)}s) — أول صوت بعد ${firstAudio}ms`);
    ws.close();
  }
  if (msg.error) console.error('❌', msg.error);
};
ws.onclose = e => { if (e.code !== 1000 && e.code !== 1005) console.log('closed', e.code, e.reason); };
