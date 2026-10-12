import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET_DIR = path.join(ROOT_DIR, 'tests');
export const HISTORY_FILE = path.join(ROOT_DIR, 'query_history.json');
export const STATE_FILE = path.join(ROOT_DIR, '.router-state.json');
export const DEFAULT_ROUTING_FILE = path.join(ROOT_DIR, 'routing.json');
export const ENV_FILE = path.join(ROOT_DIR, '.env');
