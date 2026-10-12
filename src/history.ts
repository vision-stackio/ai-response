import * as fs from 'node:fs';
import { HISTORY_FILE } from './paths.js';
import { KINDS, type Kind } from './types.js';

export interface HistoryRecord {
  timestamp: string;
  fileName: string;
  kind: Kind;
  fileType: string;
  provider: string;
  model: string;
  /** Models that failed before this one answered. */
  fallbacks: string[];
  output: string;
}

/** Records written by the previous single-provider version have no kind/provider/model. */
type StoredRecord = Partial<HistoryRecord> & { fileType?: string; agentUsed?: string };

const SHOWN_PER_KIND = 5;

function loadHistory(): StoredRecord[] {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveHistoryRecord(record: HistoryRecord): void {
  const history = loadHistory();
  history.push(record);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function kindOf(record: StoredRecord): Kind {
  if (record.kind) return record.kind;
  if (record.fileType?.startsWith('image/')) return 'image';
  if (record.fileType?.startsWith('video/')) return 'video';
  return 'docs';
}

function formatTime(timestamp = ''): string {
  return /^\d{4}-\d\d-\d\dT/.test(timestamp) ? new Date(timestamp).toLocaleString() : timestamp;
}

/** Prints past queries grouped by type - the "old queries" column of the diagram. */
export function printHistory(): void {
  const history = loadHistory();
  if (history.length === 0) {
    console.log('\n📜 [History] No prior queries found.');
    return;
  }

  console.log('\n========================================');
  console.log('📜 OLD QUERIES');
  console.log('========================================');

  for (const kind of KINDS) {
    const records = history.filter((r) => kindOf(r) === kind);
    if (records.length === 0) continue;

    console.log(`\n${kind} (${records.length})`);
    for (const r of records.slice(-SHOWN_PER_KIND)) {
      const model = r.provider ? `${r.provider}/${r.model}` : (r.agentUsed ?? 'unknown');
      console.log(`  • [${formatTime(r.timestamp)}] ${r.fileName} → ${model}`);
    }
    if (records.length > SHOWN_PER_KIND) console.log(`  … and ${records.length - SHOWN_PER_KIND} older`);
  }
  console.log('\n========================================');
}
