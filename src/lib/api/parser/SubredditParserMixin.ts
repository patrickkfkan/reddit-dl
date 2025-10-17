import { type Subreddit } from '../../entities/Subreddit';
import { SITE_URL } from '../../utils/Constants';
import ObjectHelper from '../../utils/ObjectHelper';
import { validateURL } from '../../utils/URL';
import { type APIDataParserConstructor } from './APIDataParser';

export function SubredditParserMixin<TBase extends APIDataParserConstructor>(
  Base: TBase
) {
  return class SubredditParser extends Base {
    name = 'SubredditParser';

    parseSubreddit(data: any) {
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
    }
  };
}
