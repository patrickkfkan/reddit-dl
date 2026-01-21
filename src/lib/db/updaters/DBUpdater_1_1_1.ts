import { type Database } from 'better-sqlite3';
import type Logger from '../../utils/logging/Logger.js';
import { type DBUpdater } from '../Update.js';

const TARGET_VERSION = '1.1.1';

function update(
  _db: Database,
  _currentVersion: string,
  _logger?: Logger | null
) {
  // Only indexes added in 1.1.1 - already done in Init.ts
  // Nothing to do here
  return Promise.resolve();
}

export const DBUpdater_1_1_1: DBUpdater = {
  targetVersion: TARGET_VERSION,
  update
};
