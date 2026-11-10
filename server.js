// سيرفر خفيف: مجمع المسارات والمتحكم في تشغيل التطبيق
import 'dotenv/config';
import express from 'express';
import { PORT, MODEL, API_VERSION, ACCESS_CODE } from './src/config.js';
import { authMiddleware } from './src/middleware/auth.js';
import { staticRouter } from './src/routes/static.js';
import { healthRouter } from './src/routes/health.js';
import { eventsRouter } from './src/routes/events.js';
import { voiceRouter } from './src/voice/index.js';
import { toolsRouter } from './src/tools/index.js';
import { uploadRouter } from './src/routes/upload.js';
import { dashboardRouter } from './src/routes/dashboard.js';
import { chatRouter } from './src/routes/chat.js';
import { executiveRouter } from './src/routes/executive.js';
import { driveRouter } from './src/routes/drive.js';
import { bootstrap, shutdown } from './src/bootstrap.js';

export const app = express();
app.use(express.json({ limit: '1mb' }));

// تمكين CORS لدعم نشر الواجهة منفصلة (مثل Vercel أو Netlify)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-code, x-upload-trace');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 1) الملفات الثابتة والواجهة (بدون رمز دخول)
app.use(staticRouter);

// 2) حماية مسارات /api برمز الدخول
app.use('/api', authMiddleware);

// 3) مسارات API النمطية
app.use(healthRouter);
app.use(eventsRouter);
app.use(voiceRouter);
app.use(toolsRouter);
app.use(uploadRouter);
app.use(dashboardRouter);
app.use(chatRouter);
app.use(executiveRouter);
app.use(driveRouter);

// 4) تهيئة الخدمات وتشغيل السيرفر
let server;
export async function startServer(port = PORT) {
  const info = await bootstrap();
  return new Promise((resolve) => {
    server = app.listen(port, () => {
      console.log(
        `✅ http://localhost:${port}  (model: ${MODEL}, api: ${API_VERSION}, code: ${ACCESS_CODE ? 'on' : 'off'}, store: ${info.backend}, designer: ${info.designer}, agent: ${JSON.stringify(info.agent)})`
      );
      resolve(server);
    });
  });
}

const isDirectRun = process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server'));
if (isDirectRun) {
  startServer().catch(err => {
    console.error('Server boot failed:', err);
    process.exit(1);
  });
}

// إيقاف نظيف عند استلام SIGTERM
process.on('SIGTERM', () => shutdown(server));
