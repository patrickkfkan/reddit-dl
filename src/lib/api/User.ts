import { type APIConstructor } from '.';
import { type Subscription } from '../entities/User';
import { Abortable, AbortError } from '../utils/Abortable';
import { DELETED_USER } from '../utils/Constants';
import ObjectHelper from '../utils/ObjectHelper';

export interface FetchSubscriptionParams {
  after?: string;
  limit?: number;
}

export interface FetchSubscriptionResult {
  subscriptions: Subscription[];
  after: string | null;
}

export type UserAPIConstructor = new (
  ...args: any[]
) => InstanceType<ReturnType<typeof UserAPIMixin<APIConstructor>>>;

const MAX_LIMIT = 100;

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
        return this.parser.parseUser(
          ObjectHelper.getProperty(json, 'data', true)
        );
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
        return this.parser.parseUser(json);
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        throw Error(`Failed to fetch "me" info`, { cause: error });
      }
    }

    async fetchSubscriptions(
      params: FetchSubscriptionParams
    ): Promise<FetchSubscriptionResult> {
      const { after, limit = MAX_LIMIT } = params;
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/subreddits/mine/subscriber`,
              params: {
                raw_json: '1',
                sr_detail: '1',
                limit: String(limit),
                after: after || null
              },
              signal,
              requiresAuth: true
            })
          )
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const subscriptions: Subscription[] = children.map((child) => {
          const displayNamePrefixed = ObjectHelper.getProperty(
            child,
            'data.display_name_prefixed'
          );
          const subredditType = ObjectHelper.getProperty(
            child,
            'data.subreddit_type'
          );
          const isUser =
            subredditType === 'user' &&
            typeof displayNamePrefixed === 'string' &&
            displayNamePrefixed.startsWith('u/');
          if (isUser) {
            return {
              type: 'user',
              username: displayNamePrefixed.substring(2)
            };
          }
          return {
            type: 'subreddit',
            subreddit: this.parser.parseSubreddit(child)
          };
        });
        return {
          subscriptions,
          after: ObjectHelper.getProperty(data, 'data.after') || null
        };
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        throw Error(`Failed to fetch subscriptions`, { cause: error });
      }
    }
  };
}
