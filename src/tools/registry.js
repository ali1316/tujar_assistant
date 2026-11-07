import { tools as dataTools } from '../../db.js';
import { docTools } from '../../docs.js';
import { memoryTools } from '../../memory.js';
import { dashboardTools } from '../../dashboards.js';
import { historyTools } from '../../history.js';
import { datasetTools } from '../../datasets.js';
import { knowledgeTools } from '../../knowledge.js';
import { driveTools } from '../../drive.js';
import { agentTools, initAgent } from '../../agent.js';
import { ingestTools } from '../../ingest/index.js';
import { ensureIndex, hybridSearch, cite } from '../../retrieval.js';
import { usageTools } from './usage.js';

// search_documents: البحث الهجين (معنى + كلمات) بدل الكلمات فقط، مع الاستشهاد بالمصدر. القديم يبقى للقياس.
export const legacySearchDocs = docTools.search_documents.run;
docTools.search_documents.run = async ({ query = '', document_id } = {}) => {
  try {
    await ensureIndex();
    const { hits } = await hybridSearch(query, { k: 5, prefix: document_id ? `doc:${document_id}` : null });
    if (hits.length) {
      return {
        matches: hits.map(h => ({
          cite: `[${h.n}] ${cite(h)}`,
          doc_id: h.src.startsWith('doc:') ? +h.src.slice(4) : h.src,
          name: h.title,
          section: h.section,
          page: h.page,
          content: h.text,
        })),
      };
    }
  } catch (e) {
    console.warn('[rag] search fallback:', e.message);
  }
  return legacySearchDocs({ query, document_id });
};

export const tools = {
  ...dataTools,
  ...docTools,
  ...memoryTools,
  ...dashboardTools,
  ...historyTools,
  ...datasetTools,
  ...knowledgeTools,
  ...usageTools,
  ...driveTools,
  ...agentTools,
  ...ingestTools,
};

initAgent(tools);
