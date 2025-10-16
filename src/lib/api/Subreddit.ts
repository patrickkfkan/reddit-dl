import { type APIConstructor } from '.';
import { Abortable, AbortError } from '../utils/Abortable';

export function SubredditAPIMixin<TBase extends APIConstructor>(Base: TBase) {
  return class SubredditAPI extends Base {
    async fetchSubreddit(name: string) {
      try {
        const { json } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/r/${name}/about.json`,
              params: {
                raw_json: '1'
              },
              signal
            })
          )
        );
        return this.parser.parseSubreddit(json);
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        throw Error(`Failed to fetch subreddit "${name}"`, { cause: error });
      }
    }
  };
}
