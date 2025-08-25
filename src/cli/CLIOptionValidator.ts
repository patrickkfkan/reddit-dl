import fs from 'fs';
import { type CLIOptionParserEntry } from './CLIOptions.js';
import path from 'path';
import { DateTime } from 'luxon';
import {
  CLI_DATE_TIME_FORMAT,
  CLI_DATE_TIME_FORMAT_SHORT
} from './CommandLineParser.js';

export default class CLIOptionValidator {
  static validateRequired(entry?: CLIOptionParserEntry, errMsg?: string) {
    if (entry && entry.value) {
      return entry.value;
    }
    if (errMsg) {
      throw Error(errMsg);
    }
    if (entry) {
      throw Error(`${entry.key} requires a value`);
    }
    throw Error('A required option missing');
  }

  static validateString<T extends string[]>(
    entry?: CLIOptionParserEntry,
    ...match: T
  ): T[number] | undefined {
    if (!entry) {
      return undefined;
    }
    const value = entry.value || undefined;
    if (match.length > 0 && value && !match.includes(value)) {
      throw Error(
        `${entry.key} must be one of ${match.map((m) => `'${m}'`).join(', ')}`
      );
    }
    return value;
  }

  static validateBoolean(entry?: CLIOptionParserEntry) {
    if (!entry) {
      return undefined;
    }
    const value = entry.value || undefined;
    const trueValues = ['yes', '1', ' true'];
    const falseValues = ['no', '0', 'false'];
    let sanitized: boolean | undefined;
    if (value) {
      if (trueValues.includes(value.toLowerCase())) {
        sanitized = true;
      } else if (falseValues.includes(value.toLowerCase())) {
        sanitized = false;
      } else {
        const allowedValues = [...trueValues, ...falseValues];
        throw Error(
          `${entry.key} must be one of ${allowedValues.map((m) => `'${m}'`).join(', ')}; currently '${value}'`
        );
      }
    } else {
      sanitized = undefined;
    }
    return sanitized;
  }

  static validateNumber(
    entry?: CLIOptionParserEntry,
    min?: number,
    max?: number
  ) {
    if (!entry) {
      return undefined;
    }
    const value = entry.value || undefined;
    const sanitized = value ? parseInt(value, 10) : undefined;
    if (sanitized !== undefined) {
      if (isNaN(sanitized)) {
        throw Error(`${entry.key} is not a valid number`);
      } else if (min !== undefined && sanitized < min) {
        throw Error(`${entry.key} must not be less than ${min}`);
      } else if (max !== undefined && sanitized > max) {
        throw Error(`${entry.key} must not be greater than ${max}`);
      }
    }
    return sanitized;
  }

  static validateProxyURL(entry?: CLIOptionParserEntry) {
    if (!entry || !entry.value) {
      return '';
    }
    try {
      const urlObj = new URL(entry.value);
      const supportedProtocols = ['http', 'https', 'socks4', 'socks5'];
      const urlProtocol =
        urlObj.protocol.endsWith(':') ?
          urlObj.protocol.substring(0, urlObj.protocol.length - 1)
        : urlObj.protocol;
      if (!supportedProtocols.includes(urlProtocol)) {
        throw Error(
          `Unsupported proxy protocol '${urlProtocol}'; must be one of ${supportedProtocols.map((p) => `'${p}'`).join(', ')}.`
        );
      }
      return urlObj.toString();
    } catch (error) {
      if (error instanceof Error)
        throw Error(`${entry.key} has invalid value: ${error.message}`);

      throw Error(`${entry.key} has invalid value.`, { cause: error });
    }
  }

  static validateFileExists(entry?: CLIOptionParserEntry) {
    if (!entry || !entry.value) {
      return undefined;
    }
    const resolvedPath = path.resolve(entry.value);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      throw Error(`"${resolvedPath}" does not exist or is not a file`);
    }
    return resolvedPath;
  }

  static validateDateTime(entry?: CLIOptionParserEntry): number | undefined {
    if (!entry || !entry.value) {
      return undefined;
    }
    let dt = DateTime.fromFormat(entry.value, CLI_DATE_TIME_FORMAT);
    if (!dt.isValid) {
      dt = DateTime.fromFormat(entry.value, CLI_DATE_TIME_FORMAT_SHORT);
    }
    if (!dt.isValid) {
      throw Error(
        `Invalid date/time format for ${entry.key}. Expected format is "${CLI_DATE_TIME_FORMAT}" or "${CLI_DATE_TIME_FORMAT_SHORT}".`
      );
    }
    return dt.toMillis();
  }
}
