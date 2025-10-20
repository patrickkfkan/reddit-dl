import { type APIConstructor } from '.';
import { isAbortError } from '../utils/Abortable';

export function SubredditAPIMixin<TBase extends APIConstructor>(Base: TBase) {
  return class SubredditAPI extends Base {
    async fetchSubreddit(name: string) {
      try {
        const { json } = await this.defaultLimiter.schedule(() =>
          this.fetcher.fetchAPI({
            endpoint: `/r/${name}/about.json`,
            params: {
              raw_json: '1'
            }
          })
        );
        return this.parser.parseSubreddit(json);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        throw Error(`Failed to fetch subreddit "${name}"`, { cause: error });
      }
    }
  };
}
