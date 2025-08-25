import { type Logger } from '../utils/logging';
import { commonLog, type LogLevel } from '../utils/logging/Logger';
import { PostAPIMixin } from './Post';
import { SubredditAPIMixin } from './Subreddit';
import { UserAPIMixin } from './User';
import type Fetcher from '../utils/Fetcher';
import { type DownloadableImage } from '../entities/Common';
import ObjectHelper from '../utils/ObjectHelper';
import { type DownloadModeConfig } from '../DownloaderOptions';
import type Limiter from '../utils/Limiter';
import type Bottleneck from 'bottleneck';
import { DEFAULT_LIMITER_NAME } from '../utils/Constants';

export type APIConstructor = new (...args: any[]) => APIBase;
export type APIInstance = InstanceType<typeof API>;

export class APIBase {
  name = 'API';

  protected config: DownloadModeConfig;
  protected fetcher: Fetcher;
  protected limiter: Limiter;
  protected defaultLimiter: Bottleneck;
  protected logger?: Logger | null;

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
    this.defaultLimiter = limiter.get(DEFAULT_LIMITER_NAME);
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

  protected mapDownloadableImage(
    data: any,
    srcProperty: string
  ): DownloadableImage | null {
    const src = ObjectHelper.getProperty(data, srcProperty);
    return src ? { src } : null;
  }
}

const API = PostAPIMixin(SubredditAPIMixin(UserAPIMixin(APIBase)));

export default API;
