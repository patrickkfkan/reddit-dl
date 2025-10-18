import { EOL } from 'os';
import PromptSync from 'prompt-sync';
import { type CLIOptions, getCLIOptions } from './CLIOptions.js';
import CommandLineParser, {
  CLI_DATE_TIME_FORMAT
} from './CommandLineParser.js';
import type Logger from '../lib/utils/logging/Logger.js';
import { commonLog, type LogLevel } from '../lib/utils/logging/Logger.js';
import { type PackageInfo, getPackageInfo } from '../lib/utils/PackageInfo.js';
import FileLogger from '../lib/utils/logging/FileLogger.js';
import ConsoleLogger from '../lib/utils/logging/ConsoleLogger.js';
import ChainLogger from '../lib/utils/logging/ChainLogger.js';
import RedditDownloader from '../lib/RedditDownloader.js';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { getPostIdFromURL } from '../lib/utils/URL.js';
import OAuth, { type OAuthParams } from '../lib/utils/OAuth.js';
import {
  DownloaderMode,
  type DownloaderOptions,
  type DownloadModeConfig
} from '../lib/DownloaderOptions.js';
import { WebServer } from '../lib/server/WebServer.js';
import { createProxyAgent } from '../lib/utils/Proxy.js';
import { getLocalIPAddress } from '../lib/utils/Misc.js';
import { DateTime } from 'luxon';
import DB from '../lib/db/index.js';
import { type ResolvedTarget } from '../lib/entities/Target.js';

type StartParams<T extends DownloaderMode> = {
  mode: T;
} & (T extends DownloaderMode.DOWNLOAD ?
  {
    targets: string[];
    options: DownloaderOptions<DownloaderMode.DOWNLOAD>;
    logger: Logger;
    fileLogger?: FileLogger;
    noPrompt: boolean;
    logLevel: LogLevel;
    previousTargets: string[];
  }
: T extends DownloaderMode.BROWSE ?
  {
    options: DownloaderOptions<DownloaderMode.BROWSE>;
    logger: Logger;
    fileLogger?: FileLogger;
    logLevel: LogLevel;
  }
: never);

export default class RedditDownloaderCLI {
  #logger: Logger | null;
  #packageInfo: PackageInfo;

  constructor() {
    this.#logger = null;
    this.#packageInfo = getPackageInfo();
  }

  async start() {
    if (CommandLineParser.showUsage()) {
      return this.exit(0);
    }

    if (this.#packageInfo.banner) {
      console.log(`${EOL}${this.#packageInfo.banner}${EOL}`);
    }

    let startParams;
    try {
      startParams = await this.#getStartParams();
    } catch (error) {
      console.error(
        'Error processing options: ',
        error instanceof Error ? error.message : error,
        EOL,
        "See usage with '-h' option."
      );
      return this.exit(1);
    }

    if (startParams.mode === DownloaderMode.DOWNLOAD) {
      const {
        targets,
        options,
        logger,
        fileLogger,
        noPrompt,
        logLevel,
        previousTargets
      } = startParams as StartParams<DownloaderMode.DOWNLOAD>;
      this.#logger = logger;
      // Create downloader
      let downloader;
      try {
        downloader = new RedditDownloader(targets, { ...options });
      } catch (error) {
        commonLog(
          logger,
          'error',
          null,
          'Failed to get downloader instance:',
          error
        );
        return this.exit(1);
      }

      if (!downloader) {
        commonLog(
          logger,
          'error',
          null,
          'Failed to get downloader instance (unknown reason)'
        );
        return this.exit(1);
      }

      const downloaderName = downloader.name;

      if (!noPrompt) {
        console.log(
          `Created ${downloaderName} instance with the following config: `,
          EOL
        );
        this.#printDownloadModeConfig(
          downloader.getConfig(),
          previousTargets,
          logLevel,
          fileLogger
        );

        if (!this.#confirmProceed()) {
          console.log('Abort');
          return this.exit(1);
        }
      } else {
        commonLog(
          logger,
          'debug',
          null,
          `Created ${downloaderName} instance with config:`,
          downloader.getConfig()
        );
      }

      try {
        const abortController = new AbortController();
        process.on('SIGINT', () => {
          abortController.abort();
        });
        await downloader.start({ signal: abortController.signal });
        return await this.exit(0);
      } catch (error) {
        commonLog(
          logger,
          'error',
          null,
          `Uncaught ${downloaderName} error:`,
          error
        );
        return this.exit(1);
      }
    } else if (startParams.mode === DownloaderMode.BROWSE) {
      const { options, logger, fileLogger, logLevel } =
        startParams as StartParams<DownloaderMode.BROWSE>;
      this.#logger = logger;
      if (logLevel === 'none') {
        console.log('Logging disabled', EOL);
      } else if (fileLogger) {
        console.log(`Log to file: ${fileLogger.getConfig().logFilePath}`, EOL);
      }
      let server;
      try {
        server = new WebServer(options);
      } catch (error) {
        commonLog(
          logger,
          'error',
          null,
          'Failed to create web server instance:',
          error
        );
        return this.exit(1);
      }
      try {
        process.on('SIGINT', () => {
          void (async () => {
            try {
              await server.stop();
              commonLog(logger, 'info', null, 'Web server stopped');
              return await this.exit(0);
            } catch (error) {
              commonLog(
                logger,
                'error',
                null,
                'Failed to stop web server:',
                error
              );
              return this.exit(1);
            }
          })();
        });
        await server.start();
        const ip = getLocalIPAddress();
        commonLog(
          logger,
          'info',
          null,
          `Web server is running on http://${ip}:${server.getConfig().port}`
        );
      } catch (error) {
        commonLog(logger, 'error', null, `Failed to start web server:`, error);
        return this.exit(1);
      }
    }
  }

  async #getStartParams(): Promise<StartParams<DownloaderMode>> {
    const { mode, options } = getCLIOptions();
    switch (mode) {
      case DownloaderMode.DOWNLOAD:
        return await this.#getDownloadModeStartParams(
          options as CLIOptions<DownloaderMode.DOWNLOAD>['options']
        );
      case DownloaderMode.BROWSE:
        return this.#getBrowseModeStartParams(
          options as CLIOptions<DownloaderMode.BROWSE>['options']
        );
    }
  }

  async #getDownloadModeStartParams(
    options: CLIOptions<DownloaderMode.DOWNLOAD>['options']
  ): Promise<StartParams<DownloaderMode.DOWNLOAD>> {
    let parsedTarget: {
      src: 'cli' | 'file';
      targets: string[];
    } | null = null;
    let oauth: OAuthParams | null = null;

    // OAuth
    if (options.auth) {
      oauth = OAuth.readOAuthParamsFromFile(options.auth);
    }

    const target = options.target;
    // Test if target points to a file
    if (existsSync(target)) {
      try {
        const lines = readFileSync(target, 'utf-8')
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
        parsedTarget = {
          src: 'file',
          targets: lines
        };
      } catch (error) {
        throw Error(
          `Error reading file "${target}": ${error instanceof Error ? error.message : Error(String(error))}`
        );
      }
    } else {
      parsedTarget = {
        src: 'cli',
        targets: [target]
      };
    }
    const previousTargetTypes: ResolvedTarget['type'][] = [];
    const previousTargetFlags: string[] = [];
    let ptIndex = parsedTarget.targets.findIndex((t) =>
      t.startsWith('previous/')
    );
    while (ptIndex >= 0) {
      const value = parsedTarget.targets.splice(ptIndex, 1)[0].trim();
      const targetTypes = value.substring('previous/'.length).trim().split('');
      if (targetTypes.length === 0) {
        throw Error(
          `Target "${value}" is invalid: "previous/" must be followed by a combination of "r", "u", "p", "s", "j" and "f".`
        );
      }
      for (const tt of targetTypes) {
        let resolvedTargetType: ResolvedTarget['type'];
        if (tt === 'r') {
          resolvedTargetType = 'subreddit_posts';
        } else if (tt === 'u') {
          resolvedTargetType = 'user_submitted';
        } else if (tt === 'p') {
          resolvedTargetType = 'post';
        } else if (tt === 's' || tt === 'j' || tt === 'f') {
          resolvedTargetType = 'me';
        } else {
          throw Error(
            `Unknown flag "${tt}" in target "${value}": must be one of "r", "u", "p", "s", "j" and "f"`
          );
        }
        if (!previousTargetTypes.includes(resolvedTargetType)) {
          previousTargetTypes.push(resolvedTargetType);
        }
        if (!previousTargetFlags.includes(tt)) {
          previousTargetFlags.push(tt);
        }
      }
      ptIndex = parsedTarget.targets.findIndex((t) =>
        t.startsWith('previous/')
      );
    }
    const targetCountBeforeAddingPrevious = parsedTarget.targets.length;
    const addedPreviousTargets: string[] = [];
    if (previousTargetTypes.length > 0) {
      const dbFilePath = path.resolve(
        options.dataDir || process.cwd(),
        'db',
        'reddit-dl.sqlite'
      );
      if (!existsSync(dbFilePath)) {
        throw Error(
          `Previous targets specified, but DB file "${dbFilePath}" does not exist`
        );
      }
      const db = await DB.getInstance(dbFilePath);
      const targets = db.getTargets({
        type: previousTargetTypes,
        sortBy: 'leastRecentlyRun',
        limit: -1,
        offset: 0
      });
      for (const t of targets) {
        const rawValues: string[] = [];
        if (t.type === 'me') {
          if (!oauth || t.me.username !== oauth.username) {
            continue;
          }
          if (
            previousTargetFlags.includes('s') &&
            t.rawValue.includes('my/saved')
          ) {
            rawValues.push('my/saved');
          }
          if (
            previousTargetFlags.includes('j') &&
            t.rawValue.includes('my/joined')
          ) {
            rawValues.push('my/joined');
          }
          if (
            previousTargetFlags.includes('f') &&
            t.rawValue.includes('my/following')
          ) {
            rawValues.push('my/following');
          }
        } else {
          rawValues.push(t.rawValue);
        }
        for (const rv of rawValues) {
          if (!parsedTarget.targets.includes(rv)) {
            parsedTarget.targets.push(rv);
            addedPreviousTargets.push(rv);
          }
        }
      }
    }
    if (
      parsedTarget.targets.length === 0 &&
      targetCountBeforeAddingPrevious === 0 &&
      previousTargetFlags.length > 0
    ) {
      throw Error(
        `No targets returned for "previous/${previousTargetFlags.join('')}" and no other targets specified`
      );
    }
    // Check validity of target URL(s)
    const targetErrors: { target: string; error: any }[] = [];
    for (const target of parsedTarget.targets) {
      try {
        if (
          !target.startsWith('r/') &&
          !target.startsWith('u/') &&
          !target.startsWith('p/') &&
          !getPostIdFromURL(target) &&
          target !== 'my/saved' &&
          target !== 'my/joined' &&
          target !== 'my/following'
        ) {
          throw Error(
            'Target must start with "r/" or "u/", or be a link to a Reddit post'
          );
        }
      } catch (error) {
        targetErrors.push({ target, error });
      }
    }
    if (targetErrors.length > 0) {
      if (parsedTarget.src === 'cli') {
        const { target, error } = targetErrors[0];
        console.error(
          `Target "${target}" is invalid: ${error instanceof Error ? error.message : error}`
        );
      } else {
        console.error(`One or more target URLs in "${target}" is invalid:`);
        targetErrors.forEach(({ target, error }) => {
          console.error(
            `- "${target}": ${error instanceof Error ? error.message : error}`
          );
        });
      }
      console.error('');
      throw Error('Invalid target');
    }
    const { chainLogger, fileLogger } = this.#createLoggers(options);
    return {
      mode: DownloaderMode.DOWNLOAD,
      targets: parsedTarget.targets,
      options: {
        ...options,
        oauth,
        logger: chainLogger
      },
      logger: chainLogger,
      fileLogger,
      noPrompt: options.noPrompt,
      logLevel: options.logging.level,
      previousTargets: addedPreviousTargets
    };
  }

  #getBrowseModeStartParams(
    options: CLIOptions<DownloaderMode.BROWSE>['options']
  ): StartParams<DownloaderMode.BROWSE> {
    const { chainLogger, fileLogger } = this.#createLoggers(options);
    return {
      mode: DownloaderMode.BROWSE,
      options: {
        ...options,
        logger: chainLogger
      },
      logger: chainLogger,
      fileLogger,
      logLevel: options.logging.level
    };
  }

  #printDownloadModeConfig(
    config: DownloadModeConfig,
    previousTargets: string[],
    logLevel: LogLevel,
    fileLogger?: FileLogger
  ) {
    const ffmpegLines: string[] = [];
    if (config.pathToFFmpeg) {
      ffmpegLines.push(`  - Path to FFmpeg executable: ${config.pathToFFmpeg}`);
    }
    const loggingLines: string[] = [];
    if (logLevel !== 'none') {
      loggingLines.push(
        `  - Log level: ${logLevel}`,
        `  - Log to file: ${fileLogger ? fileLogger.getConfig().logFilePath : 'no'}`
      );
    }
    const targetLines: string[] = [];
    if (config.targets.length === 1) {
      targetLines.push(`- Target: ${config.targets[0]}`);
    } else {
      targetLines.push(`- Targets:`);
      config.targets.forEach((target, index) => {
        const isPrevious = previousTargets.includes(target);
        targetLines.push(
          `  ${index + 1}. ${target}${isPrevious ? ' (previous)' : ''}`
        );
      });
    }
    let overwriteLine = `- Overwrite existing data: ${config.overwrite ? 'yes' : 'no'}`;
    if (config.overwrite) {
      overwriteLine +=
        config.overwriteDeleted ?
          ', even if newer content is marked as deleted.'
        : ', but skip if newer content is marked as deleted.';
    }
    const dateRangeStrings: string[] = [];
    if (config.after) {
      dateRangeStrings.push(
        `on or after ${DateTime.fromMillis(config.after).toFormat(CLI_DATE_TIME_FORMAT)}`
      );
    }
    if (config.before) {
      dateRangeStrings.push(
        `before ${DateTime.fromMillis(config.before).toFormat(CLI_DATE_TIME_FORMAT)}`
      );
    }
    if (dateRangeStrings.length === 0) {
      dateRangeStrings.push('none');
    }
    const lines = [
      `- Data directory: ${config.dataDir}`,
      `- Authentication: ${config.oauth ? 'OAuth credentials provided' : 'none'}`,
      `- Limit: ${config.limit !== null ? config.limit : 'none'}`,
      `- Date range: ${dateRangeStrings.join('; ')}`,
      `- Fetch post comments: ${config.fetchComments ? 'yes' : 'no'}`,
      `- Fetch author details when downloading posts from multiple users: ${config.fetchPostAuthors ? 'yes' : 'no'}`,
      `- Network requests:`,
      `  - Max concurrent requests: ${config.request.maxConcurrent}`,
      `  - Max retries: ${config.request.maxRetries}`,
      `  - Min time betwen requests: ${config.request.minTime}`,
      `  - Proxy: ${config.request.proxy ? `${config.request.proxy.url} (${!config.request.proxy.rejectUnauthorizedTLS ? 'do not ' : ''}reject unauthorized TLS)` : 'none'}`,
      overwriteLine,
      `- Stop on encountering previously downloaded post: ${config.continue ? 'yes' : 'no'}`,
      `- Save target to database: ${config.saveTargetToDB ? 'yes (appears in target list when browsing downloaded content)' : 'no (will not appear in target list when browsing downloaded content)'}`,
      ...ffmpegLines,
      `- Logging:${logLevel === 'none' ? ' disabled' : ''}`,
      ...loggingLines,
      ...targetLines,
      EOL
    ];

    // Check proxy compatibility with FFmpeg
    const proxyAgentInfo = createProxyAgent(config.request.proxy);
    if (proxyAgentInfo) {
      if (proxyAgentInfo.protocol !== 'http') {
        lines.push(
          `Warn: ${proxyAgentInfo.protocol.toUpperCase()} proxy specified in config. Note that some operations use FFmpeg to download video streams. Since FFmpeg only supports HTTP proxy, these operations will ignore the specified proxy options.${EOL}`
        );
      }
    }

    lines.forEach((line) => {
      console.log(line);
      if (fileLogger) {
        commonLog(fileLogger, 'info', null, line);
      }
    });
  }

  #confirmProceed(prompt?: PromptSync.Prompt): boolean {
    if (!prompt) {
      prompt = PromptSync({ sigint: true });
    }
    const confirmProceed = prompt('Proceed (Y/n)? ');
    if (!confirmProceed.trim() || confirmProceed.trim().toLowerCase() === 'y') {
      return true;
    } else if (confirmProceed.trim().toLowerCase() === 'n') {
      return false;
    }

    return this.#confirmProceed(prompt);
  }

  #createLoggers(options: CLIOptions<DownloaderMode>['options']) {
    // Create console logger
    const consoleLogger = new ConsoleLogger({
      logLevel: options.logging.level
    });

    // Create file logger
    let fileLogger: FileLogger | undefined;
    if (options.logging.file) {
      try {
        fileLogger = new FileLogger({
          logFilePath: path.resolve(options.logging.file),
          logLevel: options.logging.level
        });
      } catch (error) {
        console.warn(
          'Failed to create file logger: ',
          error instanceof Error ? error.message : error
        );
      }
    }

    // Create chain logger
    const chainLogger = new ChainLogger([consoleLogger]);
    if (fileLogger) {
      chainLogger.add(fileLogger);
    }

    return {
      chainLogger,
      consoleLogger,
      fileLogger
    };
  }

  async exit(code?: number) {
    if (this.#logger) {
      await this.#logger.end();
    }
    process.exit(code);
  }
}
