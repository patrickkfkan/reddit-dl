export class Abortable {
  static #abortControllers: AbortController[] = [];

  static async wrap<R>(fn: (signal: AbortSignal) => Promise<R>) {
    const abortController = new AbortController();
    this.#abortControllers.push(abortController);
    const signal = abortController.signal;
    try {
      const result = await fn(signal);
      this.#checkAborted(signal);
      return result;
    } finally {
      this.#abortControllers.splice(
        this.#abortControllers.indexOf(abortController),
        1
      );
    }
  }

  static #checkAborted(signal: AbortSignal) {
    if (signal.aborted) {
      throw new AbortError();
    }
  }

  static abortAll() {
    this.#abortControllers.forEach((abortController) =>
      abortController.abort()
    );
    this.clear();
  }

  static clear() {
    this.#abortControllers = [];
  }
}

export class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}
