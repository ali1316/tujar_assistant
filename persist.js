// persist.js - DECOMMISSIONED
// PostgreSQL is now the first-class primary storage for all domain entities.
// The brittle sqlite:* JSON KV snapshotting, restore loops, and protected-mode hacks have been removed.

export const TABLES = [
  'projects',
  'tickets',
  'dev_requests',
  'documents',
  'tasks',
  'agent_jobs',
  'datasets',
  'memories',
  'dashboards',
  'chat_sessions',
  'chat_turns',
  'doc_chunks',
  'rag_chunks',
];

// Deprecated stubs maintained for backwards compatibility
export const persistState = { protected: false, reason: '', ready: true };
export const pendingSnapshot = () => false;
export const protect = () => {};
export async function snapshot() {}
export function snapshotSoon() {}
export async function restore() {}
