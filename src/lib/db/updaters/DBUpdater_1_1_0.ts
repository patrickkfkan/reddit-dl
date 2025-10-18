import { type Database } from 'better-sqlite3';
import type Logger from '../../utils/logging/Logger.js';
import { type DBUpdater } from '../Update.js';

const TARGET_VERSION = '1.1.0';

function update(
  db: Database,
  _currentVersion: string,
  _logger?: Logger | null
) {
  const sql = `
    ALTER TABLE user ADD COLUMN saved_post_count NUMBER;
    ALTER TABLE user ADD COLUMN saved_comment_count NUMBER;
    ALTER TABLE user ADD COLUMN joined_subreddit_count NUMBER;
    ALTER TABLE user ADD COLUMN following_count NUMBER;
  `;
  db.exec(sql);
  return Promise.resolve();
}

export const DBUpdater_1_1_0: DBUpdater = {
  targetVersion: TARGET_VERSION,
  update
};
