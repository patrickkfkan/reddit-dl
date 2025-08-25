import Bottleneck from 'bottleneck';

export default class Limiter {
  #instances: Record<string, Bottleneck>;

  constructor() {
    this.#instances = {};
  }

  create(key: string, options: Bottleneck.ConstructorOptions) {
    if (this.#instances[key]) {
      this.#instances[key].updateSettings(options);
    } else {
      this.#instances[key] = new Bottleneck(options);
    }
    return this.#instances[key];
  }

  get(key: string) {
    return this.#instances[key] || null;
  }

  /*  schedule(key: string, ...args: Parameters<Bottleneck['schedule']>) {
    const instance = this.#get(key);
    if (!instance) {
      throw Error(`Limiter instance does not exist for key "${key}"`);
    }
    return instance.schedule(...args);
  }*/

  clear() {
    return Promise.all(
      Object.values(this.#instances).map((instance) =>
        instance.stop({
          dropErrorMessage: 'LimiterStopOnError',
          dropWaitingJobs: true
        })
      )
    );
  }
}
