import path from 'path';
import type Logger from './utils/logging/Logger.js';
import { type DeepRequired, pickDefined } from './utils/Misc.js';
import { type OAuthParams } from './utils/OAuth.js';

export interface ProxyOptions {
  url: string;
  rejectUnauthorizedTLS?: boolean;
}

export enum DownloaderMode {
  DOWNLOAD = 'download',
  BROWSE = 'browse'
}

export type DownloaderOptions<T extends DownloaderMode> =
  T extends DownloaderMode.DOWNLOAD ?
    {
      dataDir?: string;
      oauth?: OAuthParams | null;
      limit?: number | null;
      after?: number | null; // Time in milliseconds
      before?: number | null; // Time in milliseconds
      fetchComments?: boolean;
      fetchPostAuthors?: boolean;
      request?: {
        maxRetries?: number;
        maxConcurrent?: number;
        minTime?: number;
        timeout?: number; // seconds
        proxy?: ProxyOptions | null;
      };
      overwrite?: boolean;
      overwriteDeleted?: boolean;
      continue?: boolean;
      saveTargetToDB?: boolean;
      pathToFFmpeg?: string | null;
      logger?: Logger | null;
    }
  : T extends DownloaderMode.BROWSE ?
    {
      dataDir?: string;
      port?: number | null;
      logger?: Logger | null;
    }
  : never;

export interface DownloadModeConfig
  extends DeepRequired<
    Pick<
      DownloaderOptions<DownloaderMode.DOWNLOAD>,
      | 'dataDir'
      | 'limit'
      | 'after'
      | 'before'
      | 'fetchComments'
      | 'fetchPostAuthors'
      | 'request'
      | 'overwrite'
      | 'overwriteDeleted'
      | 'continue'
      | 'saveTargetToDB'
      | 'pathToFFmpeg'
    >
  > {
  oauth: OAuthParams | null;
  targets: string[];
  logger: Logger | null;
}

export interface BrowseModeConfig
  extends DeepRequired<
    Pick<DownloaderOptions<DownloaderMode.BROWSE>, 'dataDir' | 'port'>
  > {
  logger: Logger | null;
}

const DEFAULT_DOWNLOAD_MODE_CONFIG: Pick<
  DeepRequired<DownloadModeConfig>,
  | 'dataDir'
  | 'oauth'
  | 'limit'
  | 'after'
  | 'before'
  | 'fetchComments'
  | 'fetchPostAuthors'
  | 'request'
  | 'overwrite'
  | 'overwriteDeleted'
  | 'pathToFFmpeg'
  | 'continue'
  | 'saveTargetToDB'
> & { logger: Logger | null } = {
  dataDir: process.cwd(),
  oauth: null,
  limit: null,
  after: null,
  before: null,
  fetchComments: false,
  fetchPostAuthors: false,
  request: {
    maxRetries: 3,
    maxConcurrent: 10,
    minTime: 200,
    timeout: 60,
    proxy: null
  },
  overwrite: false,
  overwriteDeleted: false,
  continue: false,
  saveTargetToDB: true,
  pathToFFmpeg: null,
  logger: null
};

const DEFAULT_BROWSE_MODE_CONFIG: Pick<
  DeepRequired<BrowseModeConfig>,
  'dataDir' | 'port'
> & { logger: Logger | null } = {
  dataDir: process.cwd(),
  port: null,
  logger: null
};

export function getDownloadModeConfig(
  targets: string[],
  options?: DownloaderOptions<DownloaderMode.DOWNLOAD>
): DownloadModeConfig {
  const defaults = DEFAULT_DOWNLOAD_MODE_CONFIG;
  return {
    dataDir:
      options?.dataDir ? path.resolve(options.dataDir) : defaults.dataDir,
    oauth: pickDefined(options?.oauth, defaults.oauth),
    limit: pickDefined(options?.limit, defaults.limit),
    after: pickDefined(options?.after, defaults.after),
    before: pickDefined(options?.before, defaults.before),
    fetchComments: pickDefined(options?.fetchComments, defaults.fetchComments),
    fetchPostAuthors: pickDefined(
      options?.fetchPostAuthors,
      defaults.fetchPostAuthors
    ),
    request: {
      maxRetries: pickDefined(
        options?.request?.maxRetries,
        defaults.request.maxRetries
      ),
      maxConcurrent: pickDefined(
        options?.request?.maxConcurrent,
        defaults.request.maxConcurrent
      ),
      minTime: pickDefined(options?.request?.minTime, defaults.request.minTime),
      timeout: pickDefined(options?.request?.timeout, defaults.request.timeout),
      proxy:
        options?.request?.proxy?.url ?
          {
            url: options.request.proxy.url,
            rejectUnauthorizedTLS:
              options.request.proxy.rejectUnauthorizedTLS ?? true
          }
        : null
    },
    overwrite: pickDefined(options?.overwrite, defaults.overwrite),
    overwriteDeleted: pickDefined(
      options?.overwriteDeleted,
      defaults.overwriteDeleted
    ),
    continue: pickDefined(options?.continue, defaults.continue),
    saveTargetToDB: pickDefined(
      options?.saveTargetToDB,
      defaults.saveTargetToDB
    ),
    pathToFFmpeg: pickDefined(options?.pathToFFmpeg, defaults.pathToFFmpeg),
    logger: pickDefined(options?.logger, defaults.logger),
    targets
  };
}

export function getBrowseModeConfig(
  options?: DownloaderOptions<DownloaderMode.BROWSE>
): BrowseModeConfig {
  const defaults = DEFAULT_BROWSE_MODE_CONFIG;
  return {
    dataDir:
      options?.dataDir ? path.resolve(options.dataDir) : defaults.dataDir,
    port: pickDefined(options?.port, defaults.port),
    logger: pickDefined(options?.logger, defaults.logger)
  };
}

export function getDefaultDownloaderdataDir() {
  return DEFAULT_DOWNLOAD_MODE_CONFIG.dataDir;
}
