import { jwtDecode } from 'jwt-decode';
import { isAbortError } from './Abortable';
import type Fetcher from './Fetcher';
import { type Logger } from './logging';
import { commonLog, type LogLevel } from './logging/Logger';
import ObjectHelper from './ObjectHelper';
import path from 'path';
import { load as cheerioLoad } from 'cheerio';
import { validateURL } from './URL';

const REDGIFS_API_URL = 'https://api.redgifs.com';
const REDGIFS_TOKEN_URL = `${REDGIFS_API_URL}/v2/auth/temporary`;
const REDGIFS_DATA_URL = `${REDGIFS_API_URL}/v2/gifs`;
const REDGIFS_MEDIA_URL = 'https://media.redgifs.com';

interface RedgifsData {
  thumbnailSrc: string | null;
  videoSrc: string | null;
  error: unknown;
}

export class RedgifsFetcher {
  name = 'RedgifsFetcher';

  #fetcher: Fetcher;
  #logger?: Logger | null;
  #token: Promise<string | null> | null;

  constructor(fetcher: Fetcher, logger?: Logger | null) {
    this.#fetcher = fetcher;
    this.#logger = logger;
    this.#token = null;
  }

  protected async getTemporaryToken() {
    if (!this.#token) {
      this.#token = this.#doGetTemporaryToken().catch((error: unknown) => {
        if (isAbortError(error)) {
          throw error;
        }
        this.#token = null;
        return null;
      });
    }
    return this.#token;
  }

  async #doGetTemporaryToken() {
    try {
      const { json } = await this.#fetcher.fetchJSON({
        url: REDGIFS_TOKEN_URL
      });
      const token = ObjectHelper.getProperty(json, 'token', true);
      if (typeof token !== 'string') {
        throw Error(`(TypeError) Expected string but got ${typeof token}`);
      }
      const { iat, exp } = jwtDecode(token);
      const expiresIn = iat && exp ? exp - iat : -1;
      if (expiresIn < 0) {
        this.log(
          'warn',
          'Obtained Redgifs temporary token, but it is missing expiry info.'
        );
      } else {
        this.log(
          'debug',
          `Obtained Redgifs temporary token - expires in ${expiresIn} seconds`
        );
        setTimeout(
          () => {
            this.#token = null;
          },
          (expiresIn - 10) * 1000
        );
      }
      return token;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      this.log(
        'error',
        `Error getting Redgifs temporary token from "${REDGIFS_TOKEN_URL}": `,
        error
      );
      throw error;
    }
  }

  async fetch(postId: string, url: string) {
    const token = await this.getTemporaryToken();
    if (!token) {
      this.log(
        'warn',
        `Failed to obtain temporary token. Will try scraping Redgifs data from "${url}".`
      );
      return this.#scrape(postId, url);
    }
    const gifId = path.parse(url).name.toLowerCase();
    const headers = {
      Authorization: `Bearer ${token}`
    };
    const apiURL = `${REDGIFS_DATA_URL}/${gifId}`;
    try {
      const { json } = await this.#fetcher.fetchJSON({
        url: apiURL,
        headers,
        onRequestRetry: (is429) => !is429
      });
      const result: RedgifsData = {
        thumbnailSrc:
          ObjectHelper.getProperty(json, 'gif.urls.poster') ||
          ObjectHelper.getProperty(json, 'gif.urls.thumbnail') ||
          null,
        videoSrc:
          ObjectHelper.getProperty(json, 'gif.urls.hd') ||
          ObjectHelper.getProperty(json, 'gif.urls.sd') ||
          ObjectHelper.getProperty(json, 'gif.urls.silent') ||
          null,
        error: null
      };
      this.log(
        'debug',
        `(${postId}) (API) Redgifs data from "${apiURL}:"`,
        result
      );
      if (!result.videoSrc) {
        result.error = '(API) No video src found in response';
      }
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      this.log(
        'error',
        `(${postId}) (API) Error fetching Redgifs data from URL "${apiURL}":`,
        error,
        ' Will try scraping.'
      );
      return this.#scrape(postId, url);
    }
  }

  async #scrape(postId: string, url: string): Promise<RedgifsData> {
    try {
      const { html } = await this.#fetcher.fetchHTML({
        url
      });
      const $ = cheerioLoad(html);
      const ld = JSON.parse($('script[type="application/ld+json"]').text());
      const contentURL = ld.video?.contentUrl;
      const thumbnailURL =
        validateURL(ld.video?.thumbnailUrl, REDGIFS_MEDIA_URL) || undefined;
      let thumbnailSrc: string | null = null;

      if (thumbnailURL) {
        /**
         * `thumbnailURL` from ld+json looks like this:
         * https://media.redgifs.com/<name>-poster.jpg
         * This function replaces the '-poster' suffix based on `variant`.
         * @param variant
         * @returns
         */
        const __getThumbnailVariant = (variant: 'poster' | 'mobile') => {
          if (variant === 'poster') {
            return thumbnailURL;
          }
          let v: string;
          switch (variant) {
            case 'mobile':
              v = '-mobile';
              break;
          }
          const urlObj = new URL(thumbnailURL);
          const { name: n, ext } = path.parse(urlObj.pathname);
          urlObj.pathname = `${n.replaceAll('-poster', v)}${ext}`;
          return urlObj.toString();
        };
        // `thumbnailURL` (with '-poster' suffix) might return 403 (forbidden).
        // Get all the variants of `thumbnailURL` and see which one is acceessible.
        const thumbnailVariants = [
          __getThumbnailVariant('poster'),
          __getThumbnailVariant('mobile')
        ];
        const thumbnailSrcErrors: { variant: string; error: Error }[] = [];
        thumbnailSrc = await (async () => {
          for (const variant of thumbnailVariants) {
            const testResult = await this.#fetcher.test(variant);
            if (testResult.ok) {
              this.log(
                'debug',
                `(${postId}) (Scrape) Test Redgifs thumbnail src "${variant}" OK`
              );
              return variant;
            } else {
              this.log(
                'debug',
                `(${postId}) (Scrape) Test Redgifs thumbnail src "${variant}" failed: `,
                testResult.error
              );
              thumbnailSrcErrors.push({ variant, error: testResult.error });
            }
          }
          this.log(
            'warn',
            `(${postId}) (Scrape) Failed to extract Redgifs thumbnail src from "${url}". Tried the following:`
          );
          for (const { variant, error: e } of thumbnailSrcErrors) {
            this.log('warn', `${variant}:`, e);
          }
          return null;
        })();
      }

      this.log(
        'debug',
        `(${postId}) (Scrape) Redgifs thumbnail src: `,
        thumbnailSrc
      );

      if (!contentURL) {
        return {
          thumbnailSrc: null,
          videoSrc: null,
          error: `(Scrape) Video source extraction failed on "${url}": no contentURL found in ld+json data`
        };
      }

      /**
       * `contentURL` from ld+json looks like this:
       * https://media.redgifs.com/<name>-silent.mp4
       * This function replaces the '-silent' suffix based on `variant`.
       * @param variant
       * @returns
       */
      const __getVideoSrcVariant = (variant: 'full' | 'mobile' | 'silent') => {
        if (variant === 'silent') {
          return contentURL;
        }
        let v: string;
        switch (variant) {
          case 'full':
            v = '';
            break;
          case 'mobile':
            v = '-mobile';
            break;
        }
        const urlObj = new URL(contentURL);
        const { name: n, ext } = path.parse(urlObj.pathname);
        urlObj.pathname = `${n.replaceAll('-silent', v)}${ext}`;
        return urlObj.toString();
      };

      // `contentURL` (with '-silent' suffix) does not have audio data.
      // Get all variants of `contentURL` and test which one is accessible, prioritizing
      // those with audio data.
      const videoSrcVariants = [
        __getVideoSrcVariant('full'),
        __getVideoSrcVariant('mobile'),
        __getVideoSrcVariant('silent')
      ];
      const videoSrcErrors: { variant: string; error: Error }[] = [];
      const videoSrc = await (async () => {
        for (const variant of videoSrcVariants) {
          this.log(
            'debug',
            `(${postId}) (Scrape) Test Redgifs video src:`,
            variant
          );
          const testResult = await this.#fetcher.test(variant);
          if (testResult.ok) {
            this.log(
              'debug',
              `(${postId}) (Scrape) Test Redgifs video src "${variant}" OK`
            );
            return variant;
          } else {
            this.log(
              'debug',
              `(${postId}) (Scrape) Test Redgifs video src "${variant}" failed: `,
              testResult.error
            );
            videoSrcErrors.push({ variant, error: testResult.error });
          }
        }
        this.log(
          'warn',
          `(${postId}) (Scrape) Failed to extract Redgifs video src. Tried the following:`
        );
        for (const { variant, error: e } of videoSrcErrors) {
          this.log('warn', `${variant}:`, e);
        }
        return null;
      })();

      if (videoSrc) {
        this.log('debug', `(${postId}) (Scrape) Redgifs video src: `, videoSrc);
        return {
          thumbnailSrc,
          videoSrc: videoSrc,
          error: null
        };
      }

      return {
        error: `(Scrape) Failed to read content URL "${contentURL}" or its variants`,
        thumbnailSrc,
        videoSrc: null
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      return {
        error,
        videoSrc: null,
        thumbnailSrc: null
      };
    }
  }

  protected log(level: LogLevel, ...msg: Array<any>) {
    commonLog(this.#logger, level, this.name, ...msg);
  }
}
