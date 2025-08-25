import { type Subreddit } from '../entities/Subreddit';
import { type User } from '../entities/User';

export default class Session {
  #processedSubreddits: Subreddit[];
  #processedUsers: User[];

  constructor() {
    this.#processedSubreddits = [];
    this.#processedUsers = [];
  }
  addProcessedSubreddit(subreddit: Subreddit) {
    if (!this.getProcessedSubreddit(subreddit)) {
      this.#processedSubreddits.push(subreddit);
    }
  }
  addProcessedUser(user: User) {
    if (!this.getProcessedUser(user)) {
      this.#processedUsers.push(user);
    }
  }
  getProcessedSubreddit(subreddit: Subreddit) {
    return (
      this.#processedSubreddits.find(
        (processedSubreddit) => processedSubreddit.id === subreddit.id
      ) || null
    );
  }
  getProcessedUser(user: User) {
    return (
      this.#processedUsers.find(
        (processedUser) => processedUser.username === user.username
      ) || null
    );
  }
}
