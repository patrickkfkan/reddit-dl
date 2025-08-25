import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { URL } from 'url';
import path from 'path';
import { fetch, Request, type Response } from 'undici';
import { type LogLevel } from './logging/Logger.js';
import { commonLog } from './logging/Logger.js';
import { ensureDirSync } from 'fs-extra';
import { sleepBeforeExecute } from './Misc.js';
import { createProxyAgent, type ProxyAgentInfo } from './Proxy.js';
import ffmpeg from 'fluent-ffmpeg';
import { Abortable, AbortError } from './Abortable.js';
import OAuth from './OAuth.js';
import { OAUTH_URL, SITE_URL } from './Constants.js';
import { type DownloadModeConfig } from '../DownloaderOptions.js';
import { getFFmpegVersion } from './FFmpegInfo.js';
import FSHelper from './FSHelper.js';

const RETRY_INTERVAL = 1000;
const RETRY_INTERVAL_429 = 300000; // 5 mins

export interface FetcherDownloadParams {
  src: string;
  dest: string;
  signal: AbortSignal;
}

export interface StartDownloadOverrides {
  destFilePath?: string;
  tmpFilePath?: string;
}

export interface FetcherDownloadResult {
  tmpFilePath: string;
  commit: () => void;
  discard: () => void;
}

export type FetcherTestResult =
  | {
      ok: true;
      lastURL: string;
    }
  | {
      ok: false;
      lastURL: string;
      error: Error;
    };

export class FetcherError extends Error {
  static NO_AUTH = -999;

  url: string;
  method: string;
  statusCode?: number;
  statusText?: string;
  fatal: boolean;

  constructor(args: {
    message: string;
    url: string;
    method?: 'GET' | 'POST' | 'HEAD';
    cause?: any;
    statusCode?: number;
    statusText?: string;
    fatal?: boolean;
  }) {
    const {
      message,
      url,
      method = 'GET',
      cause,
      statusCode,
      statusText,
      fatal = false
    } = args;
    super(message);
    this.name = 'FetcherError';
    this.url = url;
    this.method = method;
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.fatal = fatal;
    if (cause) {
      this.cause = cause;
    }
  }
}

interface RateLimitStats {
  remaining: number;
  resetSeconds: number;
  used: number;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 5.0; SM-G900P Build/LRX21T) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.4144.1067 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.4920.1566 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.9170.1979 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.8025.1701 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.4366.1868 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0 maglev/25072.1611.3570.1995/49',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.3829.1374 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.4900.1920 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.3020.1071 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.3132.1083 Safari/537.36'
];

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomIntInclusive(min: number, max: number) {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled); // The maximum is inclusive and the minimum is inclusive
}

export default class Fetcher {
  name = 'Fetcher';

  #config: DownloadModeConfig;
  #proxyAgentInfo?: ProxyAgentInfo;
  #accessToken: string | null;
  #apiUserAgent: string;
  #generalUserAgent: string;
  #ffmpegVersion: string | null;

  constructor(
    config: DownloadModeConfig,
    oauth: OAuth | null,
    proxyAgentInfo?: ProxyAgentInfo
  ) {
    this.#config = config;
    this.#proxyAgentInfo = proxyAgentInfo;
    this.#accessToken = null;
    this.#generalUserAgent =
      USER_AGENTS[getRandomIntInclusive(0, USER_AGENTS.length)];
    if (config.oauth && oauth) {
      this.#apiUserAgent = oauth.getUserAgent();
    } else {
      this.#apiUserAgent = this.#generalUserAgent;
    }
    if (oauth) {
      oauth.on('accessTokenUpdated', (token) => {
        this.#accessToken = token;
      });
      oauth.on('error', (error) => {
        this.log(
          'error',
          'OAuth error - API requests will be made without authorization:',
          error
        );
        this.#accessToken = null;
      });
    }
    this.#ffmpegVersion = null;
  }

  static async getInstance(config: DownloadModeConfig) {
    const proxyAgentInfo = createProxyAgent(config.request.proxy) || undefined;
    const oauth = config.oauth ? OAuth.getInstance(config) : null;
    const instance = new Fetcher(config, oauth, proxyAgentInfo);
    if (oauth) {
      return new Promise<Fetcher>((resolve, reject) => {
        const errorHandler = (error: any) => {
          reject(
            Error('Failed to create Fetcher instance due to OAuth error', {
              cause: error
            })
          );
        };
        oauth.once('accessTokenUpdated', () => {
          oauth.removeListener('error', errorHandler);
          resolve(instance);
        });
        oauth.once('error', errorHandler);
        oauth.start();
      });
    }
    return instance;
  }

  #getFFmpegVersion() {
    if (this.#ffmpegVersion) {
      return this.#ffmpegVersion;
    }
    try {
      this.#ffmpegVersion = getFFmpegVersion(this.#config.pathToFFmpeg);
      this.log('debug', `FFmpeg version: ${this.#ffmpegVersion}`);
    } catch (error) {
      if (error instanceof Error) {
        this.log('error', 'Failed to get FFmpeg version:', error);
      } else {
        this.log('error', 'Failed to get FFmpeg version:', String(error));
      }
      this.log('warn', 'FFmpeg command might fail');
      this.#ffmpegVersion = 'error';
    }

    return this.#ffmpegVersion;
  }

  async fetchHTML(args: {
    url: string;
    signal: AbortSignal;
    hybrid?: boolean;
  }) {
    const { url, signal, hybrid } = args;
    const headers: Record<string, string> = {};
    if (hybrid) {
      headers['Accept-Language'] = 'en-GB,en;q=0.5';
      headers['Accept'] = 'text/vnd.reddit.hybrid+html, text/html;q=0.9';
    }
    return this.fetchWithRetry({
      url,
      headers,
      signal,
      processResponse: async (res) => ({
        html: await res.text()
      })
    });
  }

  async fetchJSON(
    args: Omit<Parameters<typeof this.fetchWithRetry>[0], 'processResponse'>
  ) {
    return this.fetchWithRetry({
      ...args,
      processResponse: async (res) => ({
        json: await res.json()
      })
    });
  }

  async fetchAPI(args: {
    endpoint: string;
    params: Record<string, string | null | undefined>;
    signal: AbortSignal;
    requiresAuth?: boolean;
  }) {
    const { endpoint, params, signal, requiresAuth = false } = args;
    const baseURL = this.#accessToken ? OAUTH_URL : SITE_URL;
    const url = new URL(endpoint, baseURL);
    const headers: Record<string, string> = {};
    if (this.#accessToken) {
      headers['User-Agent'] = this.#apiUserAgent;
      headers['Authorization'] = `Bearer ${this.#accessToken}`;
    } else {
      headers['Accept-Language'] = 'en-GB,en;q=0.5';
    }
    if (requiresAuth && !this.#accessToken) {
      throw new FetcherError({
        message: 'Authentication required',
        url: url.toString(),
        statusCode: FetcherError.NO_AUTH
      });
    }
    for (const [param, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(param, value);
      }
    }
    let rateLimitStats: RateLimitStats | null = null;
    return this.fetchWithRetry({
      url: url.toString(),
      headers,
      onResponse: (res) => {
        rateLimitStats = this.#getRateLimitStats(res);
        this.log('debug', 'API rate limit stats:', rateLimitStats);
      },
      onRequestRetry: (is429) => {
        if (is429 && rateLimitStats) {
          return (rateLimitStats.resetSeconds + 10) * 1000;
        }
        return true;
      },
      signal,
      processResponse: async (res) => ({
        json: await res.json()
      })
    });
  }

  async fetchWithRetry<R, M extends 'GET' | 'HEAD' = 'GET'>(
    args: {
      url: string;
      method?: M;
      headers?: Record<string, string>;
      onResponse?: (res: Response) => void;
      onRequestRetry?: (is429: boolean) => number | boolean;
      processResponse: (
        res: M extends 'HEAD' ? Response
        : M extends 'GET' ? Response & { body: NodeJS.ReadableStream }
        : never
      ) => Promise<R>;
      signal: AbortSignal;
    },
    rt = 0
  ): Promise<R & { lastURL: string }> {
    const {
      url,
      method = 'GET',
      headers,
      onResponse,
      onRequestRetry,
      processResponse,
      signal
    } = args;
    const urlObj = new URL(url);
    const request = new Request(urlObj, {
      method,
      headers: {
        'User-Agent': this.#generalUserAgent
      }
    });
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        request.headers.set(key, value);
      }
    } else {
      request.headers.set('Accept-Language', 'en-GB,en;q=0.5');
    }
    try {
      this.log('debug', `${rt > 0 ? `(Retry #${rt}) ` : ''}${method} "${url}"`);
      const res = await fetch(request, {
        signal,
        dispatcher: this.#proxyAgentInfo?.agent
      });

      if (onResponse) {
        onResponse(res);
      }

      switch (method) {
        case 'HEAD':
          this.#assertResponseOK(res, url, false);
          break;
        default:
          this.#assertResponseOK(res, url, true);
      }

      return {
        ...(await processResponse(res as any)),
        lastURL: res.url
      };
    } catch (error) {
      if (signal.aborted) {
        throw new AbortError();
      }
      if (error instanceof FetcherError && error.fatal) {
        throw error;
      }
      const maxRetries = this.#config.request.maxRetries;
      if (rt < maxRetries) {
        if (error instanceof FetcherError && error.statusCode === 429) {
          const retry = onRequestRetry ? onRequestRetry(true) : true;
          const retryInterval =
            typeof retry === 'number' ? retry
            : retry ? RETRY_INTERVAL_429
            : -1;
          if (retryInterval > 0) {
            this.log(
              'error',
              `Hit rate limit while fetching "${url}" - will retry in ${retryInterval / 1000} seconds`
            );
            return Abortable.wrap((_signal) =>
              sleepBeforeExecute(
                () => this.fetchWithRetry(args, rt + 1),
                retryInterval,
                _signal
              )
            );
          }
        } else {
          const retry = onRequestRetry ? onRequestRetry(false) : true;
          const retryInterval =
            typeof retry === 'number' ? retry
            : retry ? RETRY_INTERVAL
            : -1;
          if (retryInterval > 0) {
            this.log('error', `Error fetching "${url}" - will retry:`, error);
            return Abortable.wrap((_signal) =>
              sleepBeforeExecute(
                () => this.fetchWithRetry(args, rt + 1),
                RETRY_INTERVAL,
                _signal
              )
            );
          }
        }
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      const retriedMsg = rt > 0 ? ` (retried ${rt} times)` : '';
      throw new FetcherError({
        message: `(${method}) ${errMsg}${retriedMsg}`,
        url: urlObj.toString(),
        method,
        cause: error
      });
    }
  }

  async test(url: string, signal: AbortSignal): Promise<FetcherTestResult> {
    let lastURL = url;
    try {
      return await this.fetchWithRetry({
        url,
        method: 'HEAD',
        signal,
        onResponse: (res) => {
          lastURL = res.url;
        },
        processResponse: () => Promise.resolve({ ok: true })
      });
    } catch (error) {
      return {
        ok: false,
        lastURL,
        error: error instanceof Error ? error : Error(String(error))
      };
    }
  }

  async downloadFile(
    params: FetcherDownloadParams,
    rt = 0
  ): Promise<FetcherDownloadResult> {
    const { src, dest, signal } = params;
    const destFilePath = path.resolve(dest);
    const { dir: destDir } = path.parse(destFilePath);
    const tmpFilePath = this.#getTmpFilePath(destFilePath);
    const request = new Request(src, {
      method: 'GET',
      headers: {
        'User-Agent': this.#generalUserAgent
      }
    });
    try {
      const res = await fetch(request, {
        signal,
        dispatcher: this.#proxyAgentInfo?.agent
      });
      if (this.#assertResponseOK(res, src)) {
        ensureDirSync(destDir);
        this.log('debug', `Download: "${src}" -> "${tmpFilePath}"`);
        await pipeline(res.body, fs.createWriteStream(tmpFilePath));
        return {
          tmpFilePath,
          commit: () => this.#commitDownload(tmpFilePath, destFilePath),
          discard: () => this.#cleanupDownload(tmpFilePath)
        };
      }
    } catch (error) {
      this.#cleanupDownload(tmpFilePath);
      if (signal.aborted) {
        throw new AbortError();
      }
      if (error instanceof FetcherError && error.fatal) {
        throw error;
      }
      const maxRetries = this.#config.request.maxRetries;
      if (rt < maxRetries) {
        if (error instanceof FetcherError && error.statusCode === 429) {
          this.log(
            'error',
            `Got "429 - Too many requests" error while attempting to download "${src}" - will retry in ${RETRY_INTERVAL_429 / 1000} seconds`
          );
          return Abortable.wrap((_signal) =>
            sleepBeforeExecute(
              () => this.downloadFile({ src, dest, signal }, rt + 1),
              RETRY_INTERVAL_429,
              _signal
            )
          );
        }
        this.log('error', `Error downloading "${src}" - will retry: `, error);
        return Abortable.wrap((_signal) =>
          sleepBeforeExecute(
            () => this.downloadFile({ src, dest, signal }, rt + 1),
            RETRY_INTERVAL,
            _signal
          )
        );
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      const retriedMsg = rt > 0 ? ` (retried ${rt} times)` : '';
      throw new FetcherError({
        message: `${errMsg}${retriedMsg}`,
        url: src,
        method: 'GET',
        cause: error instanceof Error ? error : Error(String(error))
      });
    }

    return undefined as never;
  }

  async downloadVideo(params: FetcherDownloadParams, rt = 0) {
    const { src, dest, signal } = params;

    const ext = path.extname(new URL(src).pathname);
    if (ext === '.mp4') {
      return this.downloadFile(params);
    }

    const tmpFilePath = this.#getTmpFilePath(dest);

    return new Promise<FetcherDownloadResult>((resolve, reject) => {
      const inputOptions = [
        '-protocol_whitelist crypto,http,https,tcp,tls,httpproxy'
      ];
      if (ext === '.m3u8' && this.#getFFmpegVersion().startsWith('7.')) {
        inputOptions.push('-extension_picky 0');
      }
      const ffmpegCommand = ffmpeg(src)
        .inputOptions(inputOptions)
        .output(tmpFilePath)
        .outputOptions('-c copy')
        .outputOptions('-f mp4')
        .on('start', (commandLine: string) => {
          this.log('debug', 'FFmpeg command begin:', commandLine);
        })
        .on('end', () => {
          this.log('debug', 'FFmpeg download completed');
          resolve({
            tmpFilePath,
            commit: () => this.#commitDownload(tmpFilePath, dest),
            discard: () => this.#cleanupDownload(tmpFilePath)
          });
        })
        .on('error', (error: any) => {
          this.#cleanupDownload(tmpFilePath);
          if (signal.aborted) {
            reject(new AbortError());
            return;
          }
          const maxRetries = this.#config.request.maxRetries;
          if (rt < maxRetries) {
            this.log(
              'error',
              `Error downloading HLS video from "${src}" - will retry: `,
              error
            );
            Abortable.wrap((_signal) =>
              sleepBeforeExecute(
                () => this.downloadVideo({ src, dest, signal }, rt + 1),
                RETRY_INTERVAL,
                _signal
              )
            )
              .then((result) => {
                resolve(result);
              })
              .catch((error: unknown) => {
                reject(error instanceof Error ? error : Error(String(error)));
              });
            return;
          }
          const errMsg = error instanceof Error ? error.message : error;
          const retriedMsg = rt > 0 ? ` (retried ${rt} times)` : '';
          reject(
            new FetcherError({
              message: `${errMsg}${retriedMsg}`,
              url: src,
              cause: error
            })
          );
        });

      signal.onabort = () => {
        ffmpegCommand.kill('SIGKILL');
      };

      if (this.#proxyAgentInfo) {
        // FFmpeg only supports HTTP proxy
        if (this.#proxyAgentInfo.protocol === 'http') {
          ffmpegCommand.inputOptions(
            '-http_proxy',
            this.#proxyAgentInfo.proxyURL
          );
        } else {
          this.log(
            'warn',
            `${this.#proxyAgentInfo.protocol.toUpperCase()} proxy ignored - FFmpeg supports HTTP proxy only`
          );
        }
      }

      ffmpegCommand.run();
    });
  }

  #commitDownload(tmpFilePath: string, destFilePath: string) {
    try {
      this.log(
        'debug',
        `Commit: "${tmpFilePath}" -> "${destFilePath} (filesize: ${fs.lstatSync(tmpFilePath).size} bytes)`
      );
      fs.renameSync(tmpFilePath, destFilePath);
    } finally {
      this.#cleanupDownload(tmpFilePath);
    }
  }

  #cleanupDownload(tmpFilePath: string) {
    try {
      if (fs.existsSync(tmpFilePath)) {
        this.log('debug', `Cleanup "${tmpFilePath}"`);
        fs.unlinkSync(tmpFilePath);
      }
    } catch (error) {
      this.log('error', `Cleanup error "${tmpFilePath}":`, error);
    }
  }

  #getTmpFilePath(filePath: string) {
    const { dir: destDir, ext, name } = path.parse(filePath);
    const numberSuffix = name.match(/_\d+$/)?.[0];
    let _name = name;
    if (numberSuffix) {
      _name = name.substring(0, name.length - numberSuffix.length);
    }
    const destFilename = FSHelper.getSanitizedFilename(_name, {
      suffix: numberSuffix,
      ext: `${ext}.part`
    });
    return path.resolve(destDir, destFilename);
  }

  #getRateLimitStats(response: Response): RateLimitStats | null {
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
    const used = Number(response.headers.get('x-ratelimit-used'));
    if (!isNaN(remaining) && !isNaN(resetSeconds) && !isNaN(used)) {
      return {
        remaining,
        resetSeconds,
        used
      };
    }
    return null;
  }

  #assertResponseOK(
    response: Response | null,
    originURL: string,
    requireBody: false
  ): response is Response;
  #assertResponseOK(
    response: Response | null,
    originURL: string,
    requireBody?: true
  ): response is Response & { body: NodeJS.ReadableStream };
  #assertResponseOK(
    response: Response | null,
    originURL: string,
    requireBody = true
  ) {
    if (!response) {
      throw new FetcherError({ message: 'No response', url: originURL });
    }
    if (!response.ok) {
      throw new FetcherError({
        message: `${response.status} - ${response.statusText}`,
        url: originURL,
        statusCode: response.status,
        statusText: response.statusText
      });
    }
    if (requireBody && !response.body) {
      throw new FetcherError({
        message: 'Empty response body',
        url: originURL
      });
    }
    return true;
  }

  protected log(level: LogLevel, ...msg: Array<any>) {
    commonLog(this.#config.logger, level, this.name, ...msg);
  }
}
