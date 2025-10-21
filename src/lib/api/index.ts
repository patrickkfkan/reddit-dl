import { type Logger } from '../utils/logging';
import { commonLog, type LogLevel } from '../utils/logging/Logger';
import { PostAPIMixin } from './Post';
import { SubredditAPIMixin } from './Subreddit';
import { UserAPIMixin } from './User';
import type Fetcher from '../utils/Fetcher';
import { type DownloadModeConfig } from '../DownloaderOptions';
import type Limiter from '../utils/Limiter';
import APIDataParser, {
  type APIDataParserInstance
} from './parser/APIDataParser';
import { SavedItemAPIMixin } from './SavedItem';

export type APIConstructor = new (...args: any[]) => APIBase;
export type APIInstance = InstanceType<typeof API>;

export class APIBase {
  name = 'API';

  protected config: DownloadModeConfig;
  protected fetcher: Fetcher;
  protected limiter: Limiter;
  protected logger?: Logger | null;
  protected parser: APIDataParserInstance;

  constructor(
    config: DownloadModeConfig,
    fetcher: Fetcher,
    limiter: Limiter,
    logger?: Logger | null
  ) {
    this.config = config;
    this.fetcher = fetcher;
    this.limiter = limiter;
    this.logger = logger;
    this.parser = new APIDataParser(logger);
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

const API = SavedItemAPIMixin(
  PostAPIMixin(SubredditAPIMixin(UserAPIMixin(APIBase)))
);

export default API;
