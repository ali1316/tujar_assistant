import { tools } from './registry.js';
import { ALLOW_WRITES } from '../config.js';

export async function executeTool(name, params = {}) {
  const tool = tools[name];
  if (!tool) {
    const err = new Error('أداة غير معروفة');
    err.status = 404;
    throw err;
  }
  if (tool.write && !ALLOW_WRITES) {
    const err = new Error('التعديل مقفل');
    err.status = 403;
    throw err;
  }

  const result = await tool.run(params || {});
  console.log(`[tool] ${name}`, JSON.stringify(params), '→', JSON.stringify(result).slice(0, 200));
  return result;
}

export async function handleToolRoute(req, res) {
  try {
    const result = await executeTool(req.params.name, req.body || {});
    res.json(result);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
}
