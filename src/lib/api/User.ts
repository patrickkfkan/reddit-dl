import { type APIConstructor } from '.';
import { type Subscription } from '../entities/User';
import { isAbortError } from '../utils/Abortable';
import { DEFAULT_LIMITER_NAME, DELETED_USER } from '../utils/Constants';
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
        const { json } = await this.limiter.schedule(DEFAULT_LIMITER_NAME, () =>
          this.fetcher.fetchAPI({
            endpoint: `/user/${username}/about.json`,
            params: {
              raw_json: '1'
            }
          })
        );
        return this.parser.parseUser(
          ObjectHelper.getProperty(json, 'data', true)
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        throw Error(`Failed to fetch user "${username}"`, { cause: error });
      }
    }

    async fetchMe() {
      try {
        const { json } = await this.limiter.schedule(DEFAULT_LIMITER_NAME, () =>
          this.fetcher.fetchAPI({
            endpoint: `/api/v1/me`,
            params: {
              raw_json: '1'
            },
            requiresAuth: true
          })
        );
        return this.parser.parseUser(json);
      } catch (error) {
        if (isAbortError(error)) {
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
        const { json: data } = await this.limiter.schedule(
          DEFAULT_LIMITER_NAME,
          () =>
            this.fetcher.fetchAPI({
              endpoint: `/subreddits/mine/subscriber`,
              params: {
                raw_json: '1',
                sr_detail: '1',
                limit: String(limit),
                after: after || null
              },
              requiresAuth: true
            })
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
        if (isAbortError(error)) {
          throw error;
        }
        throw Error(`Failed to fetch subscriptions`, { cause: error });
      }
    }
  };
}
