import { readFileSync } from "fs";
import { OAuthParams } from "./OAuth";

export class AuthFile {
  static read(file: string): { oauth: OAuthParams | null, cookie: string | null } {
    try {
      const lines = readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .map((line) => {
          let _l = line.trim();
          if (
            (_l.length > 1 && _l.startsWith("'") && _l.endsWith("'")) ||
            (_l.startsWith('"') && _l.endsWith('"'))
          ) {
            _l = _l.substring(1, _l.length - 1);
          }
          return _l;
        })
        .filter((line) => line && !line.startsWith('#'));
      const props = lines.reduce<Record<string, string>>((result, line) => {
        const equalIndex = line.indexOf('=');
        if (equalIndex >= 1) {
          const prop = line.substring(0, equalIndex).trim();
          const value = line.substring(equalIndex + 1).trim();
          if (prop && value) {
            result[prop] = value;
          }
        }
        return result;
      }, {});
      const params: Record<keyof OAuthParams, string> = {
        clientId: props['client.id'],
        clientSecret: props['client.secret'],
        username: props['username'],
        password: props['password']
      };
      return {
        oauth: this.#validateOAuthParams(params),
        cookie: props['cookie'] || null
      };
    } catch (error) {
      throw Error(
        `Error reading auth file "${file}": ${error instanceof Error ? error.message : Error(String(error))}`
      );
    }
  }

  static #validateOAuthParams(
    value: Record<string, any>
  ): OAuthParams | null {
    const skeleton: OAuthParams = {
      clientId: '',
      clientSecret: '',
      username: '',
      password: ''
    };
    const skeletonToFilePropMap: Record<keyof typeof skeleton, string> = {
      clientId: 'client.id',
      clientSecret: 'client.secret',
      username: 'username',
      password: 'password'
    };
    if (Object.keys(skeleton).every((prop) => !value[prop])) {
      return null;
    }
    for (const prop of Object.keys(skeleton)) {
      if (!value[prop]) {
        throw Error(
          `OAuth parameter "${skeletonToFilePropMap[prop as keyof typeof skeleton]}" is missing or does not have a value.`
        );
      }
    }
    return value as OAuthParams;
  }

}