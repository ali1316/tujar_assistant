import { Router } from 'express';
import { handleToolRoute } from './handler.js';

const router = Router();

// POST /api/tools/:name
router.post('/api/tools/:name', handleToolRoute);

export { router as toolsRouter };
export { tools } from './registry.js';
export { executeTool, handleToolRoute } from './handler.js';
