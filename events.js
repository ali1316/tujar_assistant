// بث لحظي للمتصفح (Server-Sent Events): أي تغيير في البيانات أو مهمة Claude توصل الشاشة فوراً بدون تحديث
import { EventEmitter } from 'node:events';
export const bus = new EventEmitter();
bus.setMaxListeners(100);
export const BOOT_ID = Date.now().toString(36); // يتغير مع كل نشر → المتصفح يعرف إن فيه نسخة جديدة

export function sseRoute(app) {
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    send('hello', { boot: BOOT_ID });
    const on = (type, data) => send(type, data);
    const types = ['data', 'job'];
    const handlers = types.map(t => [t, d => on(t, d)]);
    handlers.forEach(([t, h]) => bus.on(t, h));
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); handlers.forEach(([t, h]) => bus.off(t, h)); });
  });
}
let dt; export const dataChanged = what => { clearTimeout(dt); dt = setTimeout(() => bus.emit('data', { what }), 150); };
