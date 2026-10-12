import * as fs from 'fs';
import * as path from 'path';

export interface HistoryRecord {
  timestamp: string;
  fileName: string;
  fileType: string;
  agentUsed: string;
  output: string;
}

const HISTORY_FILE = path.join(process.cwd(), 'query_history.json');

export function saveHistoryRecord(record: HistoryRecord) {
  let history: HistoryRecord[] = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch {
      history = [];
    }
  }
  history.push(record);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

export function printHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    console.log("\n📜 [History] No prior search queries found.");
    return;
  }
  const history: HistoryRecord[] = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  console.log("\n========================================");
  console.log("📜 PREVIOUS QUERY OUTPUT HISTORY");
  console.log("========================================");
  history.forEach((h, index) => {
    console.log(`${index + 1}. [${h.timestamp}] File: ${h.fileName} | Tool: ${h.agentUsed}`);
  });
  console.log("========================================");
}
