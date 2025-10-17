import { type User } from '../../entities/User';
import { SITE_URL } from '../../utils/Constants';
import ObjectHelper from '../../utils/ObjectHelper';
import { validateURL } from '../../utils/URL';
import { type APIDataParserConstructor } from './APIDataParser';

export function UserParserMixin<TBase extends APIDataParserConstructor>(
  Base: TBase
) {
  return class UserParser extends Base {
    name = 'UserParser';

    parseUser(data: any) {
      const _username = ObjectHelper.getProperty(data, 'name', true);
      const isSuspended = ObjectHelper.getProperty(data, 'is_suspended');
      const userURLStr = ObjectHelper.getProperty(data, 'subreddit.url');
      const userURL = userURLStr ? validateURL(userURLStr, SITE_URL) : false;
      if (!userURL && !isSuspended) {
        this.log(
          'warn',
          `(${_username}) User profile has invalid URL value "${userURLStr}"`
        );
      }
      const user: User = {
        username: _username,
        wasFetchedFromAPI: true,
        isSuspended: typeof isSuspended === 'boolean' ? isSuspended : false,
        url: userURL || '',
        title: ObjectHelper.getProperty(data, 'subreddit.title') || '',
        description:
          ObjectHelper.getProperty(data, 'subreddit.public_description') || '',
        avatar: this.mapDownloadableImage(data, 'snoovatar_img'),
        banner: this.mapDownloadableImage(data, 'subreddit.banner_img'),
        icon: this.mapDownloadableImage(data, 'icon_img'),
        karma: ObjectHelper.getProperty(data, 'total_karma') || 0
      };
      return user;
    }
  };
}
