import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import DB from '../db';
import WebRequestHandler from './handler';
import { getWebRequestRouter } from './Router';
import {
  type BrowseModeConfig,
  type DownloaderMode,
  type DownloaderOptions,
  getBrowseModeConfig
} from '../DownloaderOptions';
import { type Server } from 'http';
import getPort from 'get-port';
import { DEFAULT_WEB_SERVER_PORT } from '../utils/Constants';

export class WebServer {
  name = 'WebServer';

  #config: BrowseModeConfig;
  #app: express.Express;
  #server: Server | null;
  #status: 'stopped' | 'started';
  #port: number | null;

  constructor(options: DownloaderOptions<DownloaderMode.BROWSE>) {
    this.#config = getBrowseModeConfig(options);
    this.#app = express();
    this.#server = null;
    this.#status = 'stopped';
    this.#port = null;
  }

  async start() {
    if (this.#status === 'started') {
      return;
    }
    const dbFile = path.resolve(this.#config.dataDir, 'db', 'reddit-dl.sqlite');
    if (!existsSync(dbFile)) {
      throw Error(`DB file "${dbFile}" does not exist`);
    }
    const db = DB.getInstance(dbFile, this.#config.logger);
    const handler = new WebRequestHandler(
      db,
      this.#config.dataDir,
      this.#config.logger
    );
    const router = getWebRequestRouter(handler);

    this.#app.use(express.json());
    this.#app.use(express.urlencoded({ extended: true }));
    this.#app.use(
      '/assets',
      express.static(path.resolve(__dirname, '../../web/assets'))
    );
    this.#app.use(
      '/themes',
      express.static(path.resolve(__dirname, '../../web/themes'))
    );

    this.#app.use(router);

    this.#port = await this.#getPort();

    return new Promise<void>((resolve, reject) => {
      this.#server = this.#app.listen(this.#port, (error) => {
        if (error) {
          reject(error);
          return;
        }
        this.#status = 'started';
        resolve();
      });
    });
  }

  stop() {
    if (this.#status === 'stopped') {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      if (this.#server) {
        this.#server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          this.#server = null;
          this.#port = null;
          this.#status = 'stopped';
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  #getPort() {
    if (this.#config.port !== null) {
      return this.#config.port;
    }
    return getPort({ port: DEFAULT_WEB_SERVER_PORT });
  }

  getConfig(): BrowseModeConfig {
    return {
      ...this.#config,
      port: this.#port
    };
  }
}
