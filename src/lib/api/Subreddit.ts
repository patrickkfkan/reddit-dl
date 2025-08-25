import { type APIConstructor } from '.';
import { type Subreddit } from '../entities/Subreddit';
import { Abortable, AbortError } from '../utils/Abortable';
import { SITE_URL } from '../utils/Constants';
import ObjectHelper from '../utils/ObjectHelper';
import { validateURL } from '../utils/URL';

export function SubredditAPIMixin<TBase extends APIConstructor>(Base: TBase) {
  return class SubredditAPI extends Base {
    async fetchSubreddit(name: string) {
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
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
        const subredditId = ObjectHelper.getProperty(data, 'data.id', true);
        const subredditURLStr = ObjectHelper.getProperty(data, 'data.url');
        const subredditURL =
          subredditURLStr ? validateURL(subredditURLStr, SITE_URL) : false;
        if (!subredditURL) {
          this.log(
            'warn',
            `(${subredditId}) Subreddit has invalid URL value "${subredditURLStr}"`
          );
        }
        const subreddit: Subreddit = {
          id: subredditId,
          url: subredditURL || '',
          name: ObjectHelper.getProperty(data, 'data.display_name') || '',
          title: ObjectHelper.getProperty(data, 'data.title') || '',
          shortDescription:
            ObjectHelper.getProperty(data, 'data.public_description') || '',
          description: ObjectHelper.getProperty(data, 'data.description') || '',
          header: this.mapDownloadableImage(data, 'data.header_img'),
          icon:
            this.mapDownloadableImage(data, 'data.community_icon') ||
            this.mapDownloadableImage(data, 'data.icon_img'),
          banner: this.mapDownloadableImage(data, 'data.banner_img')
        };
        return subreddit;
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        throw Error(`Failed to fetch subreddit "${name}"`, { cause: error });
      }
    }
  };
}
