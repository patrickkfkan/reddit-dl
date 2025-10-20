export class Abortable {
  static #abortControllers: AbortController[] = [];

  static async wrap<R>(fn: (controller: AbortController) => Promise<R>) {
    const abortController = new AbortController();
    this.#abortControllers.push(abortController);
    const signal = abortController.signal;
    try {
      const result = await fn(abortController);
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
    if (signal.aborted && isAbortError(signal.reason)) {
      throw signal.reason;
    }
  }

  static abortAll() {
    const error = new AbortError();
    this.#abortControllers.forEach((abortController) =>
      abortController.abort(error)
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

export function isAbortError(
  error: any
): error is Error & { name: 'AbortError' } {
  return error instanceof Error && error.name === 'AbortError';
}
