import {
  DownloaderMode,
  type DownloaderOptions
} from '../lib/DownloaderOptions.js';
import { type LogLevel } from '../lib/utils/logging/Logger.js';
import CLIOptionValidator from './CLIOptionValidator.js';
import CommandLineParser, {
  type CommandLineParseResult
} from './CommandLineParser.js';

export type CLIOptions<T extends DownloaderMode> = {
  mode: T;
} & (T extends DownloaderMode.DOWNLOAD ?
  {
    options: Omit<DownloaderOptions<T>, 'oauth' | 'logger'> & {
      target: string;
      auth?: string;
      noPrompt: boolean;
      logging: {
        level: LogLevel;
        file?: string;
      };
    };
  }
: T extends DownloaderMode.BROWSE ?
  {
    options: Omit<DownloaderOptions<T>, 'logger'> & {
      dataDir?: string;
      port?: number;
      logging: {
        level: LogLevel;
        file?: string;
      };
    };
  }
: never);

export interface CLIOptionParserEntry {
  key: string;
  value?: string;
}

function getProxyOptions(
  commandLineOptions?:
    | CommandLineParseResult<DownloaderMode.DOWNLOAD>['options']
    | null
) {
  if (
    commandLineOptions?.request?.proxy &&
    commandLineOptions.request.proxy.url?.value?.trim()
  ) {
    return {
      url: CLIOptionValidator.validateProxyURL(
        commandLineOptions.request.proxy.url
      ),
      rejectUnauthorizedTLS: CLIOptionValidator.validateBoolean(
        commandLineOptions.request.proxy.rejectUnauthorizedTLS
      )
    };
  }
  return null;
}

export function getCLIOptions(): CLIOptions<DownloaderMode> {
  const commandLineParseResult = CommandLineParser.parse();
  switch (commandLineParseResult.mode) {
    case DownloaderMode.DOWNLOAD: {
      const commandLineOptions = (
        commandLineParseResult as CommandLineParseResult<DownloaderMode.DOWNLOAD>
      ).options;
      const _continue = CLIOptionValidator.validateBoolean(
        commandLineOptions.continue
      );
      const options: CLIOptions<DownloaderMode.DOWNLOAD> = {
        mode: DownloaderMode.DOWNLOAD,
        options: {
          target:
            _continue ?
              commandLineOptions.target?.value || 'previous/rupsjf'
            : CLIOptionValidator.validateRequired(
                commandLineOptions.target,
                'No target specified'
              ),
          dataDir: CLIOptionValidator.validateString(
            commandLineOptions.dataDir
          ),
          auth: CLIOptionValidator.validateFileExists(commandLineOptions.auth),
          limit: CLIOptionValidator.validateNumber(commandLineOptions.limit),
          after: CLIOptionValidator.validateDateTime(commandLineOptions.after),
          before: CLIOptionValidator.validateDateTime(
            commandLineOptions.before
          ),
          fetchComments: CLIOptionValidator.validateBoolean(
            commandLineOptions.fetchComments
          ),
          fetchPostAuthors: CLIOptionValidator.validateBoolean(
            commandLineOptions.fetchPostAuthors
          ),
          overwrite: CLIOptionValidator.validateBoolean(
            commandLineOptions.overwrite
          ),
          overwriteDeleted: CLIOptionValidator.validateBoolean(
            commandLineOptions.overwriteDeleted
          ),
          continue: _continue,
          saveTargetToDB: CLIOptionValidator.validateBoolean(
            commandLineOptions.saveTargetToDB
          ),
          request: {
            maxRetries: CLIOptionValidator.validateNumber(
              commandLineOptions.request?.maxRetries
            ),
            maxConcurrent: CLIOptionValidator.validateNumber(
              commandLineOptions.request?.maxConcurrent
            ),
            minTime: CLIOptionValidator.validateNumber(
              commandLineOptions.request?.minTime
            ),
            proxy: getProxyOptions(commandLineOptions)
          },
          pathToFFmpeg: CLIOptionValidator.validateString(
            commandLineOptions.pathToFFmpeg
          ),
          noPrompt:
            CLIOptionValidator.validateBoolean(commandLineOptions.noPrompt) ||
            false,
          logging: validateLoggingOptions(commandLineOptions)
        }
      };
      if (
        options.options.after &&
        options.options.before &&
        options.options.after >= options.options.before
      ) {
        throw Error(
          'The "--after" date/time must be before the "--before" date/time.'
        );
      }
      return options;
    }
    case DownloaderMode.BROWSE: {
      const commandLineOptions = (
        commandLineParseResult as CommandLineParseResult<DownloaderMode.BROWSE>
      ).options;
      const options: CLIOptions<DownloaderMode.BROWSE> = {
        mode: DownloaderMode.BROWSE,
        options: {
          dataDir: CLIOptionValidator.validateString(
            commandLineOptions.dataDir
          ),
          port: CLIOptionValidator.validateNumber(commandLineOptions.port),
          logging: validateLoggingOptions(commandLineOptions)
        }
      };
      return options;
    }
  }
}

function validateLoggingOptions(
  commandLineOptions: CommandLineParseResult<DownloaderMode>['options']
) {
  return {
    level:
      CLIOptionValidator.validateString(
        commandLineOptions.logging?.level,
        'info',
        'debug',
        'warn',
        'error',
        'none'
      ) || 'info',
    file: CLIOptionValidator.validateString(commandLineOptions.logging?.file)
  };
}
