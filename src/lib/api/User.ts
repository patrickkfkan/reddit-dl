import { type APIConstructor } from '.';
import { type User } from '../entities/User';
import { Abortable, AbortError } from '../utils/Abortable';
import { DELETED_USER, SITE_URL } from '../utils/Constants';
import ObjectHelper from '../utils/ObjectHelper';
import { validateURL } from '../utils/URL';

export type UserAPIConstructor = new (
  ...args: any[]
) => InstanceType<ReturnType<typeof UserAPIMixin<APIConstructor>>>;

export function UserAPIMixin<TBase extends APIConstructor>(Base: TBase) {
  return class UserAPI extends Base {
    async fetchUser(username: string) {
      if (username === DELETED_USER.username) {
        return DELETED_USER;
      }
      try {
        const { json } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/user/${username}/about.json`,
              params: {
                raw_json: '1'
              },
              signal
            })
          )
        );
        return this.#parse(ObjectHelper.getProperty(json, 'data', true));
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        throw Error(`Failed to fetch user "${username}"`, { cause: error });
      }
    }

    async fetchMe() {
      try {
        const { json } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/api/v1/me`,
              params: {
                raw_json: '1'
              },
              signal,
              requiresAuth: true
            })
          )
        );
        return this.#parse(json);
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        throw Error(`Failed to fetch "me" info`, { cause: error });
      }
    }

    #parse(data: any) {
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
