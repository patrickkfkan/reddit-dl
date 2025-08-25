import fs from 'fs';
import dateFormat from 'dateformat';
import { type LogLevel } from '../../utils/logging/Logger.js';
import ConsoleLogger, { type ConsoleLoggerOptions } from './ConsoleLogger.js';
import path from 'path';
import { EOL } from 'os';
import { type DeepRequired, pickDefined } from '../Misc.js';
import { ensureDirSync } from 'fs-extra';

export interface FileLoggerOptions extends ConsoleLoggerOptions {
  logFilePath: string;
}

export type FileLoggerConfig = DeepRequired<FileLoggerOptions>;

const DEFAULT_LOGGER_CONFIG: Omit<FileLoggerConfig, 'created'> = {
  logFilePath: '',
  logLevel: 'info',
  include: {
    dateTime: true,
    level: true,
    originator: true,
    errorStack: false
  },
  dateTimeFormat: 'mmm dd HH:MM:ss',
  color: false
};

export default class FileLogger extends ConsoleLogger {
  declare protected config: FileLoggerConfig;
  #stream: fs.WriteStream | null;
  #firstRun: boolean;

  constructor(options: FileLoggerOptions) {
    super(options);
    this.#stream = null;
    this.#firstRun = true;
    this.config.color = pickDefined(
      options?.color,
      DEFAULT_LOGGER_CONFIG.color
    );
    this.config.logFilePath = path.resolve(options.logFilePath);
  }

  #getStream() {
    if (this.#stream) {
      return this.#stream;
    }
    // Ensure log directory exists
    const logDir = path.parse(this.config.logFilePath).dir;
    ensureDirSync(logDir);

    // Create write stream
    let flags: 'a' | 'w';
    if (fs.existsSync(this.config.logFilePath) && !this.#firstRun) {
      flags = 'a';
    } else {
      flags = 'w';
    }
    this.#stream = fs.createWriteStream(this.config.logFilePath, {
      flags,
      encoding: 'utf-8',
      autoClose: false
    });
    if (this.#firstRun) {
      const initDateTimeStr = dateFormat(
        new Date(),
        'mmm dd yyyy HH:MM:ss'
      ).toUpperCase();
      this.#stream.write(
        `${EOL}*************** LOG BEGIN ${initDateTimeStr} ***************${EOL}`
      );
      this.#firstRun = false;
    }
    return this.#stream;
  }

  getConfig() {
    return this.config;
  }

  protected toOutput(_level: LogLevel, msg: string[]) {
    const stream = this.#getStream();
    stream.write(msg.join(' '));
    stream.write(EOL);
  }

  end(): Promise<void> {
    return new Promise((resolve) => {
      if (this.#stream) {
        this.#stream.once('finish', () => {
          this.#stream = null;
          resolve();
        });
        this.#stream.end();
      } else {
        resolve();
      }
    });
  }
}
