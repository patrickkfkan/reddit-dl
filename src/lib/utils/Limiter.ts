import Bottleneck from 'bottleneck';

interface LimiterInstance {
  instance: Bottleneck;
  options: Bottleneck.ConstructorOptions;
}

export default class Limiter {
  #instances: Record<string, LimiterInstance>;

  constructor() {
    this.#instances = {};
  }

  create(key: string, options: Bottleneck.ConstructorOptions) {
    if (this.#instances[key]) {
      this.#instances[key].instance.updateSettings(options);
      this.#instances[key].options = options;
    } else {
      this.#instances[key] = {
        instance: new Bottleneck(options),
        options
      };
    }
  }

  schedule<R>(key: string, fn: () => Promise<R>): Promise<R> {
    const instance = this.#instances[key]?.instance;
    if (!instance) {
      throw Error(`Limiter instance does not exist for key "${key}"`);
    }
    return instance.schedule(fn);
  }

  async clear() {
    await Promise.all(
      Object.values(this.#instances).map(({ instance }) =>
        instance.stop({
          dropErrorMessage: 'LimiterStopOnError',
          dropWaitingJobs: true
        })
      )
    );
    // Recreate instances because stop() will prevent new jobs from
    // being added
    for (const key of Object.keys(this.#instances)) {
      const options = this.#instances[key].options;
      this.#instances[key].instance = new Bottleneck(options);
    }
  }
}
