import EventEmitter from 'events';
import { type DownloadModeConfig } from '../DownloaderOptions';
import { createProxyAgent, type ProxyAgentInfo } from './Proxy';
import { readFileSync } from 'fs-extra';
import { fetch, Request } from 'undici';
import { type Logger, type LogLevel } from './logging';
import { commonLog } from './logging/Logger';
import { getPackageInfo } from './PackageInfo';

export interface OAuthParams {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface AuthData {
  accessToken: string;
  expiresIn: number; // seconds
  scope: string;
  tokenType: string;
}

export default class OAuth extends EventEmitter {
  name = 'OAuth';

  static instance: OAuth | null = null;

  #proxyAgentInfo?: ProxyAgentInfo;
  #params: OAuthParams | null;
  #authData: AuthData | null;
  #userAgent: string | null;
  #logger: Logger | null;
  #started: boolean;

  constructor(config: DownloadModeConfig) {
    super();
    this.#proxyAgentInfo = createProxyAgent(config.request.proxy) || undefined;
    this.#params = config.oauth;
    this.#logger = config.logger;
    this.#authData = null;
    this.#started = false;
    if (config.oauth) {
      const packageInfo = getPackageInfo();
      this.#userAgent = `${packageInfo.name}/${packageInfo.version} by ${config.oauth.username}`;
    } else {
      this.#userAgent = null;
    }
  }

  static getInstance(config: DownloadModeConfig) {
    if (!this.instance) {
      this.instance = new OAuth(config);
    }
    return this.instance;
  }

  start() {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.#fetchAccessToken();
  }

  getAccessToken() {
    return this.#authData?.accessToken || null;
  }

  getUserAgent() {
    if (!this.#userAgent) {
      throw Error(
        'User agent for API requests is unavailable because no OAuth params was set'
      );
    }
    return this.#userAgent;
  }

  #fetchAccessToken() {
    if (!this.#params) {
      return;
    }
    const body = new URLSearchParams();
    body.append('grant_type', 'password');
    body.append('username', this.#params.username);
    body.append('password', this.#params.password);
    const headers = {
      Authorization: `Basic ${btoa(`${this.#params.clientId}:${this.#params.clientSecret}`)}`,
      'User-Agent': this.getUserAgent()
    };
    this.log('debug', 'Fetching access token...');
    const request = new Request('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      body,
      headers
    });
    fetch(request, { dispatcher: this.#proxyAgentInfo?.agent })
      .then((response) => {
        void (async () => {
          const json = await response.json();
          this.#authData = this.#mapAuthData(json);
          this.log(
            'debug',
            `Access token updated - expires in ${this.#authData.expiresIn} seconds`
          );
          this.emit('accessTokenUpdated', this.#authData.accessToken);
          if (this.#authData.expiresIn > 0) {
            setTimeout(
              () => {
                this.#fetchAccessToken();
              },
              this.#authData.expiresIn * 1000 * 0.9
            );
          }
        })();
      })
      .catch((error: unknown) => {
        this.emit(
          'error',
          Error('Failed to fetch access token:', { cause: error })
        );
        this.#authData = null;
      });
  }

  #mapAuthData(value: any): AuthData {
    if (!value || typeof value !== 'object') {
      throw Error('Auth data is not an object');
    }
    const requiredProps = ['access_token', 'expires_in', 'scope', 'token_type'];
    for (const prop of requiredProps) {
      if (!value[prop]) {
        throw Error(`Auth data is missing "${prop}" value`);
      }
    }
    if (value['token_type'] !== 'bearer') {
      throw Error(
        `Expecting token type to be "bearer" in auth data. but got "${value['token_type']}" instead.`
      );
    }
    if (typeof value['expires_in'] !== 'number') {
      throw Error(
        `Expecting "expires_in" in auth data to be a number. but got "${typeof value['expires_in']}" instead.`
      );
    }

    return {
      accessToken: value['access_token'],
      expiresIn: value['expires_in'],
      scope: value['scope'],
      tokenType: value['token_type']
    };
  }

  static readOAuthParamsFromFile(file: string): OAuthParams {
    try {
      const lines = readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .map((line) => {
          let _l = line.trim();
          if (
            (_l.length > 1 && _l.startsWith("'") && _l.endsWith("'")) ||
            (_l.startsWith('"') && _l.endsWith('"'))
          ) {
            _l = _l.substring(1, _l.length - 1);
          }
          return _l;
        })
        .filter((line) => line && !line.startsWith('#'));
      const props = lines.reduce<Record<string, string>>((result, line) => {
        const equalIndex = line.indexOf('=');
        if (equalIndex >= 1) {
          const prop = line.substring(0, equalIndex).trim();
          const value = line.substring(equalIndex + 1).trim();
          if (prop && value) {
            result[prop] = value;
          }
        }
        return result;
      }, {});
      const params: Record<keyof OAuthParams, string> = {
        clientId: props['client.id'],
        clientSecret: props['client.secret'],
        username: props['username'],
        password: props['password']
      };
      if (this.#validateOAuthParams(params)) {
        return params;
      }
      return undefined as never;
    } catch (error) {
      throw Error(
        `Error reading OAuth params from "${file}": ${error instanceof Error ? error.message : Error(String(error))}`
      );
    }
  }

  static #validateOAuthParams(
    value: Record<string, any>
  ): value is OAuthParams {
    const skeleton: OAuthParams = {
      clientId: '',
      clientSecret: '',
      username: '',
      password: ''
    };
    const skeletonToFilePropMap: Record<keyof typeof skeleton, string> = {
      clientId: 'client.id',
      clientSecret: 'client.secret',
      username: 'username',
      password: 'password'
    };
    for (const prop of Object.keys(skeleton)) {
      if (!value[prop]) {
        throw Error(
          `Property "${skeletonToFilePropMap[prop as keyof typeof skeleton]}" is missing or does not have a value`
        );
      }
    }
    return true;
  }

  protected log(level: LogLevel, ...msg: Array<any>) {
    commonLog(this.#logger, level, this.name, ...msg);
  }

  emit(eventName: 'error', error: any): boolean;
  emit(eventName: 'accessTokenUpdated', accessToken: string): boolean;
  emit(eventName: string | symbol, ...args: any[]): boolean {
    return super.emit(eventName, ...args);
  }

  on(eventName: 'error', listener: (error: any) => void): this;
  on(
    eventName: 'accessTokenUpdated',
    listener: (accessToken: string) => void
  ): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(eventName, listener);
  }

  once(eventName: 'error', listener: (error: any) => void): this;
  once(
    eventName: 'accessTokenUpdated',
    listener: (accessToken: string) => void
  ): this;
  once(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(eventName, listener);
  }
}
