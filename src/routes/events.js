import { Router } from 'express';
import { sseRoute } from '../../events.js';

const router = Router();

// بث الأحداث للمتصفح عبر Server-Sent Events (GET /api/events)
sseRoute(router);

export { router as eventsRouter };
