import { ai } from './ai.js';
import { initDb } from '../db.js';
import { initStore, backend } from '../store.js';
import { initMemory } from '../memory.js';
import { initHistory } from '../history.js';
import { initIngest } from '../ingest/index.js';
import { ensureIndex } from '../retrieval.js';
import { designerName } from '../designer.js';
import { agentStatus } from '../agent.js';
import { driveReady } from '../drive.js';
import { startDriveSyncPolling, stopDriveSyncPolling, syncFromDrive } from './drive/sync.js';

export async function bootstrap() {
  initMemory(ai);
  initHistory(ai);

  try {
    await initDb();
    await initStore();
    await initIngest(ai);
  } catch (e) {
    console.error('[db/store] init failed:', e.message);
  }

  ensureIndex().catch(e => console.warn('[rag] boot index failed:', e.message));

  if (driveReady()) {
    const pollInterval = +(process.env.DRIVE_SYNC_INTERVAL_SEC || 60);
    startDriveSyncPolling(pollInterval);
    syncFromDrive().catch(e => console.warn('[drive-sync] initial sync error:', e.message));
  }

  return {
    backend,
    designer: designerName(),
    agent: agentStatus(),
  };
}

export async function shutdown(server) {
  console.log('[server] Exiting cleanly');
  stopDriveSyncPolling();
  if (server?.close) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}
