import os from 'os';
import { Abortable, AbortError } from './Abortable';
import _sanitizeHTML from 'sanitize-html';

// https://stackoverflow.com/questions/57835286/deep-recursive-requiredt-on-specific-properties
export type DeepRequired<T> = {
  [P in keyof T]-?: DeepRequired<T[P]>;
};

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

// Recursively sets properties of T to U
export type RecursivePropsTo<T, U> =
  T extends object ? { [P in keyof T]: RecursivePropsTo<T[P], U> }
  : T extends undefined | null ? never
  : U;

export function pickDefined<T>(value1: T | undefined, value2: T): T;
export function pickDefined<T>(value1: T, value2: T | undefined): T;
export function pickDefined(value1: undefined, value2: undefined): undefined;
export function pickDefined<T>(value1?: T, value2?: T): T | undefined;
export function pickDefined<T>(value1?: T, value2?: T) {
  return value1 !== undefined ? value1 : value2;
}

export function sleepBeforeExecute<T>(
  fn: () => Promise<T>,
  ms: number
): Promise<T> {
  return Abortable.wrap(
    (controller) =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          void (async () => {
            try {
              const result = await fn();
              resolve(result);
            } catch (error) {
              reject(error instanceof Error ? error : Error(String(error)));
            }
          })();
        }, ms);
        controller.signal.onabort = () => {
          clearTimeout(timer);
          reject(new AbortError());
        };
      })
  );
}

export function utcSecondsToDate(utcSeconds: number): Date {
  return new Date(utcSeconds * 1000);
}

export function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return '127.0.0.1';
}

const sanitizeHTMLOptions = {
  allowedTags: _sanitizeHTML.defaults.allowedTags.concat(['img']),
  allowedAttributes: {
    ..._sanitizeHTML.defaults.allowedAttributes,
    '*': ['class']
  }
};

export function sanitizeHTML(html: string) {
  return _sanitizeHTML(html, sanitizeHTMLOptions);
}
