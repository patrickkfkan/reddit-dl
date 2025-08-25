import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { type CLIOptionParserEntry, type CLIOptions } from './CLIOptions.js';
import { EOL } from 'os';
import { type DeepPartial, type RecursivePropsTo } from '../lib/utils/Misc.js';
import { getPackageInfo } from '../lib/utils/PackageInfo.js';
import { DownloaderMode } from '../lib/DownloaderOptions.js';
import {
  DEFAULT_WEB_SERVER_PORT,
  PROJECT_URL
} from '../lib/utils/Constants.js';

export interface CommandLineParseResult<T extends DownloaderMode> {
  mode: T;
  options: RecursivePropsTo<
    DeepPartial<CLIOptions<T>['options']>,
    CLIOptionParserEntry
  >;
}

export const CLI_DATE_TIME_FORMAT = 'yyyy-MM-dd HH:mm';
export const CLI_DATE_TIME_FORMAT_SHORT = 'yyyy-MM-dd';

const COMMON_ARGS = {
  help: 'help',
  dataDir: 'data-dir',
  logLevel: 'log-level',
  logFile: 'log-file'
};

const DOWNLOAD_MODE_ARGS = {
  ...COMMON_ARGS,
  target: 'target',
  auth: 'auth',
  limit: 'limit',
  after: 'after',
  before: 'before',
  fetchComments: 'comments',
  fetchPostAuthors: 'post-authors',
  overwrite: 'overwrite',
  overwriteDeleted: 'overwrite-deleted',
  continue: 'continue',
  noSaveTarget: 'no-save-target',
  maxRetries: 'max-retries',
  maxConcurrent: 'max-concurrent',
  minTime: 'min-time',
  proxy: 'proxy',
  proxyInsecure: 'proxy-insecure',
  pathToFFmpeg: 'ffmpeg',
  noPrompt: 'no-prompt'
};

const BROWSE_MODE_ARGS = {
  ...COMMON_ARGS,
  browse: 'browse',
  port: 'port'
} as const;

const COMMON_OPT_DEFS: Record<string, commandLineUsage.OptionDefinition> = {
  HELP: {
    name: COMMON_ARGS.help,
    description: 'Display this usage guide',
    alias: 'h',
    type: Boolean
  },
  LOG_LEVEL: {
    name: COMMON_ARGS.logLevel,
    description:
      "Log level: 'info', 'debug', 'warn' or 'error'; set to 'none' to disable logging. Default: info",
    alias: 'l',
    type: String,
    typeLabel: '<level>'
  },
  LOG_FILE: {
    name: COMMON_ARGS.logFile,
    description: 'Save logs to <path>',
    alias: 's',
    type: String,
    typeLabel: '<path>'
  }
};

const DOWNLOAD_MODE_OPT_DEFS: commandLineUsage.OptionDefinition[] = [
  COMMON_OPT_DEFS.HELP,
  {
    name: DOWNLOAD_MODE_ARGS.target,
    description:
      'URL of content to download, or file containing a list of URLs.',
    type: String,
    defaultOption: true
  },
  {
    name: COMMON_ARGS.dataDir,
    description:
      'Path to directory where content is saved. Default: current working directory',
    alias: 'o',
    type: String,
    typeLabel: '<dir>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.auth,
    description:
      'Path to file containing credentials required for authentication (see Authentication section below)',
    alias: 'x',
    type: String,
    typeLabel: '<file>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.limit,
    description: 'The maximum number of posts to download',
    alias: 'n',
    type: Number
  },
  {
    name: DOWNLOAD_MODE_ARGS.after,
    description: `Download posts created on or after the specified date/time ("${CLI_DATE_TIME_FORMAT}" or "${CLI_DATE_TIME_FORMAT_SHORT}", e.g. "2025-06-20 13:00" or "2025-06-20")`,
    alias: 'a',
    type: String,
    typeLabel: '<date>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.before,
    description: `Download posts created before (but not on) the specified date/time ("${CLI_DATE_TIME_FORMAT}" or "${CLI_DATE_TIME_FORMAT_SHORT}", e.g. "2025-07-20 13:00" or "2025-07-20")`,
    alias: 'b',
    type: String,
    typeLabel: '<date>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.fetchComments,
    description: 'Fetch post comments (may lead to high API usage)',
    type: Boolean
  },
  {
    name: DOWNLOAD_MODE_ARGS.fetchPostAuthors,
    description:
      'Fetch author details when downloading posts from multiple users (may lead to high API usage).',
    type: Boolean
  },
  {
    name: DOWNLOAD_MODE_ARGS.overwrite,
    description: 'Overwrite existing content',
    alias: 'w',
    type: Boolean
  },
  {
    name: DOWNLOAD_MODE_ARGS.overwriteDeleted,
    description: 'Overwrite even when newer content is marked as deleted',
    type: Boolean
  },
  {
    name: DOWNLOAD_MODE_ARGS.continue,
    description:
      'Stop on encountering previously downloaded content. Useful when you want to fetch new content since last download. You may omit TARGET with this option to fetch new content for all previous targets.',
    alias: 'e',
    type: Boolean
  },
  {
    name: DOWNLOAD_MODE_ARGS.noSaveTarget,
    description:
      "Do not save target to database, so it won't appear in the target list when browsing downloaded content.",
    type: Boolean
  },
  {
    name: DOWNLOAD_MODE_ARGS.maxRetries,
    description: 'Maximum retry attempts when a download fails. Default: 3',
    alias: 'r',
    type: Number,
    typeLabel: '<number>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.maxConcurrent,
    description: 'Maximum number of concurrent downloads. Default: 10',
    alias: 'c',
    type: Number,
    typeLabel: '<number>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.minTime,
    description: 'Minimum time to wait between fetch requests. Default: 200',
    alias: 'p',
    type: Number,
    typeLabel: '<milliseconds>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.proxy,
    description:
      'Use the specified proxy. The URI follows this scheme: "protocol://[username:[password]]@host:port". Protocol can be http, https, socks4 or socks5.',
    type: String,
    typeLabel: '<URI>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.proxyInsecure,
    description:
      'Do not reject invalid certificate when connecting to proxy through SSL / TLS. Use this option for proxies with self-signed certs.',
    type: Boolean
  },
  COMMON_OPT_DEFS.LOG_LEVEL,
  COMMON_OPT_DEFS.LOG_FILE,
  {
    name: DOWNLOAD_MODE_ARGS.pathToFFmpeg,
    description:
      'Path to FFmpeg executable (no need to set if already in system path)',
    type: String,
    typeLabel: '<path>'
  },
  {
    name: DOWNLOAD_MODE_ARGS.noPrompt,
    description: 'Do not prompt for confirmation to proceed',
    alias: 'y',
    type: Boolean
  }
];

const BROWSE_MODE_OPT_DEFS: commandLineUsage.OptionDefinition[] = [
  COMMON_OPT_DEFS.HELP,
  {
    name: BROWSE_MODE_ARGS.browse,
    description: 'Start web server for browsing downloaded content',
    type: Boolean
  },
  {
    name: COMMON_ARGS.dataDir,
    description:
      'Path to directory of downloaded content. Default: current working directory',
    alias: 'i',
    type: String,
    typeLabel: '<dir>'
  },
  {
    name: BROWSE_MODE_ARGS.port,
    description: `Web server port. Default: ${DEFAULT_WEB_SERVER_PORT}, or a random port if ${DEFAULT_WEB_SERVER_PORT} is already in use.`,
    alias: 'p',
    type: Number
  },
  COMMON_OPT_DEFS.LOG_LEVEL,
  COMMON_OPT_DEFS.LOG_FILE
];

export default class CommandLineParser {
  static parse(): CommandLineParseResult<DownloaderMode> {
    const { mode, defs, opts } = this.#parseArgs();
    const argv = process.argv;

    const __getOptNameUsed = (key: string) => {
      const name = `--${key}`;
      if (argv.includes(name)) {
        return name;
      }
      const alias = defs.find((def) => def.name === key)?.alias;
      if (alias) {
        return `-${alias}`;
      }
      return name;
    };

    const __getValue = (
      key: (typeof DOWNLOAD_MODE_ARGS)[keyof typeof DOWNLOAD_MODE_ARGS],
      reverseBoolean = false
    ): CLIOptionParserEntry | undefined => {
      let value = opts[key];

      const booleanTypeArgs = [
        DOWNLOAD_MODE_ARGS.noPrompt,
        DOWNLOAD_MODE_ARGS.fetchComments,
        DOWNLOAD_MODE_ARGS.fetchPostAuthors,
        DOWNLOAD_MODE_ARGS.overwrite,
        DOWNLOAD_MODE_ARGS.overwriteDeleted,
        DOWNLOAD_MODE_ARGS.continue,
        DOWNLOAD_MODE_ARGS.noSaveTarget,
        DOWNLOAD_MODE_ARGS.proxyInsecure
      ];
      if (booleanTypeArgs.includes(key as any) && value !== undefined) {
        value = !reverseBoolean ? '1' : '0';
      }

      if (value === null) {
        throw Error(`Command-line option requires a value for '--${key}'`);
      }
      if ((typeof value === 'string' && value) || typeof value === 'number') {
        return {
          key: __getOptNameUsed(key),
          value: String(value).trim()
        };
      }
      return undefined;
    };

    switch (mode) {
      case DownloaderMode.DOWNLOAD:
        return {
          mode: DownloaderMode.DOWNLOAD,
          options: {
            target: __getValue(DOWNLOAD_MODE_ARGS.target),
            dataDir: __getValue(DOWNLOAD_MODE_ARGS.dataDir),
            auth: __getValue(DOWNLOAD_MODE_ARGS.auth),
            limit: __getValue(DOWNLOAD_MODE_ARGS.limit),
            after: __getValue(DOWNLOAD_MODE_ARGS.after),
            before: __getValue(DOWNLOAD_MODE_ARGS.before),
            fetchComments: __getValue(DOWNLOAD_MODE_ARGS.fetchComments),
            fetchPostAuthors: __getValue(DOWNLOAD_MODE_ARGS.fetchPostAuthors),
            overwrite: __getValue(DOWNLOAD_MODE_ARGS.overwrite),
            overwriteDeleted: __getValue(DOWNLOAD_MODE_ARGS.overwriteDeleted),
            continue: __getValue(DOWNLOAD_MODE_ARGS.continue),
            saveTargetToDB: __getValue(DOWNLOAD_MODE_ARGS.noSaveTarget, true),
            request: {
              maxRetries: __getValue(DOWNLOAD_MODE_ARGS.maxRetries),
              maxConcurrent: __getValue(DOWNLOAD_MODE_ARGS.maxConcurrent),
              minTime: __getValue(DOWNLOAD_MODE_ARGS.minTime),
              proxy: {
                url: __getValue(DOWNLOAD_MODE_ARGS.proxy),
                rejectUnauthorizedTLS: __getValue(
                  DOWNLOAD_MODE_ARGS.proxyInsecure,
                  true
                )
              }
            },
            pathToFFmpeg: __getValue(DOWNLOAD_MODE_ARGS.pathToFFmpeg),
            noPrompt: __getValue(DOWNLOAD_MODE_ARGS.noPrompt),
            logging: {
              level: __getValue(DOWNLOAD_MODE_ARGS.logLevel),
              file: __getValue(DOWNLOAD_MODE_ARGS.logFile)
            }
          }
        };
      case DownloaderMode.BROWSE:
        return {
          mode: DownloaderMode.BROWSE,
          options: {
            dataDir: __getValue(BROWSE_MODE_ARGS.dataDir),
            port: __getValue(BROWSE_MODE_ARGS.port),
            logging: {
              level: __getValue(BROWSE_MODE_ARGS.logLevel),
              file: __getValue(BROWSE_MODE_ARGS.logFile)
            }
          }
        };
    }
  }

  static showUsage() {
    let opts;
    try {
      opts = this.#parseArgs().opts;
    } catch (_error) {
      return false;
    }
    if (opts.help) {
      const targetContent = [
        'Download posts from subreddit',
        '-----------------------------',
        `"r/<subreddit>"${EOL}`,

        'Download posts by user',
        '----------------------',
        `"u/<username>"${EOL}`,

        'Download a single post',
        '----------------------',
        `"https://www.reddit.com/r/<subreddit>/comments/<post_id>/..."`,
        `"https://www.reddit.com/user/<username>/comments/<post_id>/..."`,
        `"p/<post_id>"${EOL}`,

        'Download previous targets',
        '-------------------------',
        `"previous/r: - previous "subreddit" targets`,
        `"previous/u: - previous "user" targets`,
        `"previous/p: - previous "post" targets${EOL}`,
        `Combine "r", "u" and "p" to specify multiple previous target types. E.g. "previous/ru" will download from previous "subreddit" and "user" targets. Used with the "--continue" option, you can fetch new content since last download without having to specify each target manually.`
      ];

      const fileContent = [
        'You may provide multiple targets in a file. The file must be in plain text format with each target placed on its own line. Lines starting with # are ignored.'
      ];

      const authContent = [
        `reddit-dl retrieves content primarily through API requests. However, Reddit enforces rate limits, restricting the number of requests within a given timeframe. Once the limit is reached, reddit-dl will pause downloads until it resets.${EOL}`,

        `Authentication provides access to a higher API rate limit. To authenticate, register as a developer on Reddit (you can use your existing account) and obtain the required credentials. These credentials should be stored in a file and passed to reddit-dl using the --auth option.${EOL}`,

        `Detailed instructions are provided in the sample auth file here: {underline ${PROJECT_URL}/blob/main/auth.conf}${EOL}`
      ];

      const commentsContent = [
        `By default, reddit-dl does not retrieve post comments to minimize API usage. To enable comment fetching, use the "--${DOWNLOAD_MODE_ARGS.fetchComments}" option. To access {bold all} comments on a post, you must also be authenticated (see Authentication section above). Without authentication, full access to comments may be restricted.${EOL}`
      ];

      const postAuthorsContent = [
        `By default, reddit-dl skips fetching author details when downloading posts from multiple users. To override this behavior, use the "--${DOWNLOAD_MODE_ARGS.fetchPostAuthors}" option. Keep in mind that enabling this option may result in high API usage.${EOL}`
      ];

      const browseUsageContent = [
        `${getPackageInfo().name} --browse [OPTION]${EOL}`,
        `This starts a web sever. Open the web server address in a browser to access the downloaded content.${EOL}`
      ];

      const downloadUsageHeader = 'Download Reddit content';
      const browseUsageHeader = 'Browse downloaded content';

      const sections: commandLineUsage.Section[] = [
        {
          header: `${downloadUsageHeader}${EOL}${'='.repeat(downloadUsageHeader.length)}`,
          content: `${getPackageInfo().name} [OPTION]... TARGET or FILE`
        },
        {
          header: 'TARGET',
          content: targetContent.join(EOL)
        },
        {
          header: 'FILE',
          content: fileContent
        },
        {
          header: 'OPTION',
          optionList: DOWNLOAD_MODE_OPT_DEFS,
          hide: 'target'
        },
        {
          content: ''
        },
        {
          header: 'Authentication',
          content: authContent.join(EOL)
        },
        {
          header: 'Comments',
          content: commentsContent.join(EOL)
        },
        {
          header: 'Post authors',
          content: postAuthorsContent.join(EOL)
        },
        {
          header: `${browseUsageHeader}${EOL}${'='.repeat(browseUsageHeader.length)}`,
          content: browseUsageContent.join(EOL)
        },
        {
          header: 'OPTION',
          optionList: BROWSE_MODE_OPT_DEFS,
          hide: 'browse'
        },
        {
          header: 'Project home',
          content: `{underline ${PROJECT_URL}}`
        }
      ];
      const banner = getPackageInfo().banner;
      if (banner) {
        sections.unshift({ header: banner, raw: true });
      }
      const usage = commandLineUsage(sections);
      console.log(usage);

      return true;
    }

    return false;
  }

  static #parseArgs() {
    const maybeMode =
      process.argv.includes(`--${BROWSE_MODE_ARGS.browse}`) ?
        DownloaderMode.BROWSE
      : DownloaderMode.DOWNLOAD;
    const defs =
      maybeMode === DownloaderMode.BROWSE ?
        BROWSE_MODE_OPT_DEFS
      : DOWNLOAD_MODE_OPT_DEFS;
    const opts = commandLineArgs(defs, { stopAtFirstUnknown: true });
    if (opts['_unknown']) {
      const unknownOpt = opts['_unknown'][0];
      throw Error(`Unknown option '${unknownOpt}'`);
    }
    return {
      mode: maybeMode,
      defs,
      opts
    };
  }
}
