import { type Database } from 'better-sqlite3';
import { PostDBMixin } from './Post';
import { UserDBMixin } from './User';
import { type Logger } from '../utils/logging';
import { commonLog, type LogLevel } from '../utils/logging/Logger';
import { SubredditDBMixin } from './Subreddit';
import { openDB } from './Init';
import { TargetDBMixin } from './Target';
import { MediaDBMixin } from './Media';
import { EnvDBMixin } from './Env';
import { SavedItemDBMixin } from './SavedItem';

export type DBConstructor = new (...args: any[]) => DBBase;
export type DBInstance = InstanceType<typeof DB>;

export class DBBase {
  name = 'DB';

  protected static instance: DBInstance | null = null;
  protected db: Database;
  protected logger?: Logger | null;

  constructor(db: Database, logger?: Logger | null) {
    this.db = db;
    this.logger = logger;
  }

  static getInstance(file: string, logger?: Logger | null) {
    if (!this.instance) {
      const db = openDB(file, logger);
      this.instance = new DB(db, logger);
    }
    return this.instance;
  }

  protected log(level: LogLevel, ...msg: any[]) {
    const limiterStopOnError = msg.find(
      (m) => m instanceof Error && m.message === 'LimiterStopOnError'
    );
    if (limiterStopOnError) {
      return;
    }
    commonLog(this.logger, level, this.name, ...msg);
  }
}

const DB = EnvDBMixin(
  SavedItemDBMixin(
    SubredditDBMixin(
      UserDBMixin(PostDBMixin(TargetDBMixin(MediaDBMixin(DBBase))))
    )
  )
);

export default DB;
