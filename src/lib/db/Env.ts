import { type DBConstructor } from '.';

export type EnvDBConstructor = new (
  ...args: any[]
) => InstanceType<ReturnType<typeof EnvDBMixin<DBConstructor>>>;

export function EnvDBMixin<TBase extends DBConstructor>(Base: TBase) {
  return class EnvDB extends Base {
    saveEnvValue(key: string, value: any) {
      this.log('debug', `Save env value for "${key}" to DB`);
      const exists = this.checkEnvExists(key);
      if (!exists) {
        this.db
          .prepare(
            `
          INSERT INTO env (
            env_key,
            value
          )
          VALUES (?, ?)
          `
          )
          .run(key, JSON.stringify(value));
      } else {
        this.log(
          'debug',
          `Env value for "${key}" already exists in DB - update record`
        );
        this.db
          .prepare(
            `
          UPDATE env
          SET
            value = ?
          WHERE env_key = ?
          `
          )
          .run(JSON.stringify(value), key);
      }
    }

    // eslint-disable-next-line  @typescript-eslint/no-unnecessary-type-parameters
    getEnvValue<T = any>(key: string): T | null {
      this.log('debug', `Get env value for "${key}" from DB`);
      const result = this.db
        .prepare(`SELECT value FROM env WHERE env_key = ?`)
        .get(key) as { value: string } | undefined;
      return result ? JSON.parse(result.value) : null;
    }

    checkEnvExists(key: string): boolean {
      this.log('debug', `Check if env value for "${key}" exists in DB`);
      try {
        const result = this.db
          .prepare(
            `
          SELECT COUNT(env_key) as count
          FROM env
          WHERE
            env_key = ?
          `
          )
          .get(key) as { count: number };
        return result.count > 0;
      } catch (error) {
        this.log(
          'error',
          `Failed to check if env value for "${key}" exist in DB:`,
          error
        );
        return false;
      }
    }
  };
}
