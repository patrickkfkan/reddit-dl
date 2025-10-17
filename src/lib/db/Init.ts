import Database from 'better-sqlite3';
import { type Logger } from '../utils/logging';
import { existsSync } from 'fs';
import { commonLog } from '../utils/logging/Logger';

const DB_SCHEMA_VERSION = '1.0.0';

const POST_FTS_SOURCE_DELETE_SQL = `DELETE FROM post_fts_source WHERE post_id = old.post_id;`;
const POST_FTS_SOURCE_INSERT_SQL = `
  INSERT INTO post_fts_source(post_id, title, body)
  VALUES(
    new.post_id,
    json_extract(new.details, '$.title'),
    json_extract(new.details, '$.content.text')
  );
`;
const POST_FTS_DELETE_SQL = `DELETE FROM post_fts WHERE rowid = old.fts_rowid;`;
const POST_FTS_INSERT_SQL = `
  INSERT INTO post_fts(rowid, title, body)
  VALUES (
    new.fts_rowid,
    new.title,
    new.body
  );
`;
const SUBREDDIT_FTS_SOURCE_DELETE_SQL = `DELETE FROM subreddit_fts_source WHERE subreddit_id = old.subreddit_id;`;
const SUBREDDIT_FTS_SOURCE_INSERT_SQL = `
  INSERT INTO subreddit_fts_source(subreddit_id, subreddit_name, title, description, short_description)
  VALUES(
    new.subreddit_id,
    json_extract(new.details, '$.name'),
    json_extract(new.details, '$.title'),
    json_extract(new.details, '$.description'),
    json_extract(new.details, '$.shortDescription')
  );
`;
const SUBREDDIT_FTS_DELETE_SQL = `DELETE FROM subreddit_fts WHERE rowid = old.fts_rowid;`;
const SUBREDDIT_FTS_INSERT_SQL = `
  INSERT INTO subreddit_fts(rowid, subreddit_name, title, description, short_description)
  VALUES (
    new.fts_rowid,
    new.subreddit_name,
    new.title,
    new.description,
    new.short_description
  );
`;
const USER_FTS_SOURCE_DELETE_SQL = `DELETE FROM user_fts_source WHERE username = old.username;`;
const USER_FTS_SOURCE_INSERT_SQL = `
  INSERT INTO user_fts_source(username, title, description)
  VALUES(
    new.username,
    json_extract(new.details, '$.title'),
    json_extract(new.details, '$.description')
  );
`;
const USER_FTS_DELETE_SQL = `DELETE FROM user_fts WHERE rowid = old.fts_rowid;`;
const USER_FTS_INSERT_SQL = `
  INSERT INTO user_fts(rowid, username, title, description)
  VALUES (
    new.fts_rowid,
    new.username,
    new.title,
    new.description
  );
`;

const POST_COMMENT_FTS_SOURCE_DELETE_SQL = `DELETE FROM post_comment_fts_source WHERE post_comment_id = old.post_comment_id;`;
const POST_COMMENT_FTS_SOURCE_INSERT_SQL = `
  INSERT INTO post_comment_fts_source(post_comment_id, body)
  VALUES(
    new.post_comment_id,
    json_extract(new.details, '$.content.text')
  );
`;
const POST_COMMENT_FTS_DELETE_SQL = `DELETE FROM post_comment_fts WHERE rowid = old.fts_rowid;`;
const POST_COMMENT_FTS_INSERT_SQL = `
  INSERT INTO post_comment_fts(rowid, body)
  VALUES (
    new.fts_rowid,
    new.body
  );
`;

const POST_FTS_INIT = `
  CREATE TABLE IF NOT EXISTS "post_fts_source" (
    "fts_rowid" INTEGER,
    "post_id" TEXT NOT NULL,
    "title"	TEXT,
    "body" TEXT,
    PRIMARY KEY("fts_rowid"),
    FOREIGN KEY("post_id") REFERENCES "post"("post_id")
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS post_fts USING fts5(
    title,
    body,
    content = 'post_fts_source',
    content_rowid = 'fts_rowid'
  );

  CREATE TRIGGER IF NOT EXISTS post_ai AFTER INSERT ON post BEGIN
    ${POST_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_au AFTER UPDATE ON post BEGIN
    ${POST_FTS_SOURCE_DELETE_SQL}
    ${POST_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_ad AFTER DELETE ON post BEGIN
    ${POST_FTS_SOURCE_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_fts_source_ai AFTER INSERT ON post_fts_source BEGIN
    ${POST_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_fts_source_bu BEFORE UPDATE ON post_fts_source BEGIN
    ${POST_FTS_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_fts_source_au AFTER UPDATE ON post_fts_source BEGIN
    ${POST_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_fts_source_bd BEFORE DELETE ON post_fts_source BEGIN
    ${POST_FTS_DELETE_SQL}
  END;
`;

const SUBREDDIT_FTS_INIT = `
  CREATE TABLE IF NOT EXISTS "subreddit_fts_source" (
    "fts_rowid" INTEGER,
    "subreddit_id" TEXT NOT NULL,
    "subreddit_name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "short_description" TEXT,
    PRIMARY KEY("fts_rowid"),
    FOREIGN KEY("subreddit_id") REFERENCES "subreddit"("subreddit_id")
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS subreddit_fts USING fts5(
    subreddit_name,
    title,
    description,
    short_description,
    content = 'subreddit_fts_source',
    content_rowid = 'fts_rowid'
  );

  CREATE TRIGGER IF NOT EXISTS subreddit_ai AFTER INSERT ON subreddit BEGIN
    ${SUBREDDIT_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS subreddit_au AFTER UPDATE ON subreddit BEGIN
    ${SUBREDDIT_FTS_SOURCE_DELETE_SQL}
    ${SUBREDDIT_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS subreddit_ad AFTER DELETE ON subreddit BEGIN
    ${SUBREDDIT_FTS_SOURCE_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS subreddit_fts_source_ai AFTER INSERT ON subreddit_fts_source BEGIN
    ${SUBREDDIT_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS subreddit_fts_source_bu BEFORE UPDATE ON subreddit_fts_source BEGIN
    ${SUBREDDIT_FTS_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS subreddit_fts_source_au AFTER UPDATE ON subreddit_fts_source BEGIN
    ${SUBREDDIT_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS subreddit_fts_source_bd BEFORE DELETE ON subreddit_fts_source BEGIN
    ${SUBREDDIT_FTS_DELETE_SQL}
  END;
`;

const USER_FTS_INIT = `
  CREATE TABLE IF NOT EXISTS "user_fts_source" (
    "fts_rowid" INTEGER,
    "username" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    PRIMARY KEY("fts_rowid"),
    FOREIGN KEY("username") REFERENCES "user"("username")
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS user_fts USING fts5(
    username,
    title,
    description,
    content = 'user_fts_source',
    content_rowid = 'fts_rowid'
  );

  CREATE TRIGGER IF NOT EXISTS user_ai AFTER INSERT ON user BEGIN
    ${USER_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS user_au AFTER UPDATE ON user BEGIN
    ${USER_FTS_SOURCE_DELETE_SQL}
    ${USER_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS user_ad AFTER DELETE ON user BEGIN
    ${USER_FTS_SOURCE_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS user_fts_source_ai AFTER INSERT ON user_fts_source BEGIN
    ${USER_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS user_fts_source_bu BEFORE UPDATE ON user_fts_source BEGIN
    ${USER_FTS_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS user_fts_source_au AFTER UPDATE ON user_fts_source BEGIN
    ${USER_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS user_fts_source_bd BEFORE DELETE ON user_fts_source BEGIN
    ${USER_FTS_DELETE_SQL}
  END;
`;

const POST_COMMENT_FTS_INIT = `
  CREATE TABLE IF NOT EXISTS "post_comment_fts_source" (
    "fts_rowid" INTEGER,
    "post_comment_id" TEXT NOT NULL,
    "body" TEXT,
    PRIMARY KEY("fts_rowid"),
    FOREIGN KEY("post_comment_id") REFERENCES "post_comment"("post_comment_id")
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS post_comment_fts USING fts5(
    body,
    content = 'post_comment_fts_source',
    content_rowid = 'fts_rowid'
  );

  CREATE TRIGGER IF NOT EXISTS post_comment_ai AFTER INSERT ON post_comment BEGIN
    ${POST_COMMENT_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_comment_au AFTER UPDATE ON post_comment BEGIN
    ${POST_COMMENT_FTS_SOURCE_DELETE_SQL}
    ${POST_COMMENT_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_comment_ad AFTER DELETE ON post_comment BEGIN
    ${POST_COMMENT_FTS_SOURCE_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_comment_fts_source_ai AFTER INSERT ON post_comment_fts_source BEGIN
    ${POST_COMMENT_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_comment_fts_source_bu BEFORE UPDATE ON post_comment_fts_source BEGIN
    ${POST_COMMENT_FTS_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_comment_fts_source_au AFTER UPDATE ON post_comment_fts_source BEGIN
    ${POST_COMMENT_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS post_comment_fts_source_bd BEFORE DELETE ON post_comment_fts_source BEGIN
    ${POST_COMMENT_FTS_DELETE_SQL}
  END;
`;

const SAVED_ITEM_FTS_SOURCE_DELETE_SQL = `
  DELETE FROM saved_item_fts_source
  WHERE
    item_id = old.item_id AND
    item_type = old.item_type AND 
    saved_by = old.saved_by;
`;
const SAVED_ITEM_FTS_SOURCE_INSERT_SQL = `
  INSERT INTO saved_item_fts_source(item_id, item_type, saved_by, title, body)
  VALUES(
    new.item_id,
    new.item_type,
    new.saved_by,
    COALESCE(
      -- Post
      json_extract(new.details, '$.data.title'),
      -- Post comment
      json_extract(new.details, '$.postInfo.title')
    ),
    json_extract(new.details, '$.data.content.text')
  );
`;
const SAVED_ITEM_FTS_DELETE_SQL = `
  DELETE FROM saved_item_fts WHERE rowid = old.fts_rowid;
`;
const SAVED_ITEM_FTS_INSERT_SQL = `
  INSERT INTO saved_item_fts(rowid, title, body)
  VALUES (
    new.fts_rowid,
    new.title,
    new.body
  );
`;
const SAVED_ITEM_FTS_INIT = `
  CREATE TABLE IF NOT EXISTS "saved_item_fts_source" (
    "fts_rowid" INTEGER,
    "item_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "saved_by" TEXT NOT NULL,
    "title"	TEXT,
    "body" TEXT,
    PRIMARY KEY("fts_rowid"),
    FOREIGN KEY("item_id", "item_type", "saved_by") REFERENCES "saved_item"("item_id", "item_type", "saved_by")
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS saved_item_fts USING fts5(
    title,
    body,
    content = 'saved_item_fts_source',
    content_rowid = 'fts_rowid'
  );

  CREATE TRIGGER IF NOT EXISTS saved_item_ai AFTER INSERT ON saved_item BEGIN
    ${SAVED_ITEM_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS saved_item_au AFTER UPDATE ON saved_item BEGIN
    ${SAVED_ITEM_FTS_SOURCE_DELETE_SQL}
    ${SAVED_ITEM_FTS_SOURCE_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS saved_item_ad AFTER DELETE ON saved_item BEGIN
    ${SAVED_ITEM_FTS_SOURCE_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS saved_item_fts_source_ai AFTER INSERT ON saved_item_fts_source BEGIN
    ${SAVED_ITEM_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS saved_item_fts_source_bu BEFORE UPDATE ON saved_item_fts_source BEGIN
    ${SAVED_ITEM_FTS_DELETE_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS saved_item_fts_source_au AFTER UPDATE ON saved_item_fts_source BEGIN
    ${SAVED_ITEM_FTS_INSERT_SQL}
  END;

  CREATE TRIGGER IF NOT EXISTS saved_item_fts_source_bd BEFORE DELETE ON saved_item_fts_source BEGIN
    ${SAVED_ITEM_FTS_DELETE_SQL}
  END;
`;

export function openDB(file: string, logger?: Logger | null) {
  const dbFileExists = existsSync(file);

  commonLog(
    logger,
    'info',
    'DB',
    `${dbFileExists ? 'Opening' : 'Creating'} database "${file}"`
  );
  const db = new Database(file, {
    verbose: logger ? (msg) => commonLog(logger, 'debug', 'DB', msg) : undefined
  });

  db.exec(`
      BEGIN TRANSACTION;

      CREATE TABLE IF NOT EXISTS "target" (
        "target_id"	TEXT,
        "target_type" TEXT NOT NULL,
        "last_run"	INTEGER NOT NULL,
        "details" TEXT NOT NULL,
        PRIMARY KEY("target_id")
      );

      CREATE INDEX IF NOT EXISTS "target_type_index" ON "target" (
        "target_type"
      );

      CREATE INDEX IF NOT EXISTS "target_last_run_index" ON "target" (
        "last_run"
      );

      CREATE TABLE IF NOT EXISTS "subreddit" (
        "subreddit_id"	TEXT,
        "subreddit_name" TEXT NOT NULL,
        "post_count" NUMBER,
        "media_count" NUMBER,
        "details"	TEXT NOT NULL,
        PRIMARY KEY("subreddit_id")
      );

      CREATE INDEX IF NOT EXISTS "subreddit_name_index" ON "subreddit" (
        "subreddit_name"
      );

      CREATE INDEX IF NOT EXISTS "subreddit_post_count_index" ON "subreddit" (
        "post_count"
      );

      CREATE INDEX IF NOT EXISTS "subreddit_media_count_index" ON "subreddit" (
        "media_count"
      );

      CREATE TABLE IF NOT EXISTS "user" (
        "username"	TEXT,
        "post_count" NUMBER,
        "media_count" NUMBER,
        -- v1.1.0 --
        "saved_post_count" NUMBER,
        "saved_comment_count" NUMBER,
        "joined_subreddit_count" NUMBER,
        "following_count" NUMBER,
        ------------
        "karma" NUMBER,
        "details"	TEXT NOT NULL,
        PRIMARY KEY("username")
      );

      CREATE INDEX IF NOT EXISTS "user_post_count_index" ON "user" (
        "post_count"
      );

      CREATE INDEX IF NOT EXISTS "user_media_count_index" ON "user" (
        "media_count"
      );

      CREATE TABLE IF NOT EXISTS "post" (
        "post_id"	TEXT,
        "author"	TEXT,
        "subreddit_id"	TEXT,
        "created_utc"  INTEGER,
        "score" INTEGER,
        "comment_count_all" INTEGER,
        "comment_count_top_level" INTEGER,
        "details"	TEXT NOT NULL,
        PRIMARY KEY("post_id"),
        FOREIGN KEY("author") REFERENCES "user"("username"),
        FOREIGN KEY("subreddit_id") REFERENCES "subreddit"("subreddit_id")
      );

      CREATE INDEX IF NOT EXISTS "post_author_index" ON "post" (
        "author"
      );

      CREATE INDEX IF NOT EXISTS "post_subreddit_index" ON "post" (
        "subreddit_id"
      );

      CREATE INDEX IF NOT EXISTS "post_created_index" ON "post" (
        "created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_score_index" ON "post" (
        "score"
      );

      CREATE INDEX IF NOT EXISTS "post_author_created_index" ON "post" (
        "author", "created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_author_created_desc_index" ON "post" (
        "author", "created_utc" DESC
      );

      CREATE INDEX IF NOT EXISTS "post_author_score_index" ON "post" (
        "author", "score"
      );

      CREATE INDEX IF NOT EXISTS "post_author_score_desc_index" ON "post" (
        "author", "score" DESC
      );

      CREATE INDEX IF NOT EXISTS "post_subreddit_created_index" ON "post" (
        "subreddit_id", "created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_subreddit_created_desc_index" ON "post" (
        "subreddit_id", "created_utc" DESC
      );

      CREATE INDEX IF NOT EXISTS "post_subreddit_score_index" ON "post" (
        "subreddit_id", "score"
      );

      CREATE INDEX IF NOT EXISTS "post_subreddit_score_desc_index" ON "post" (
        "subreddit_id", "score" DESC
      );

      CREATE TABLE IF NOT EXISTS "post_comment" (
        "post_comment_id"	TEXT,
        "post_id" TEXT,
        "author"	TEXT,
        "parent_id" TEXT,
        "created_utc"  INTEGER,
        "score" INTEGER,
        "details"	TEXT NOT NULL,
        PRIMARY KEY("post_comment_id"),
        FOREIGN KEY("post_id") REFERENCES "post"("post_id"),
        FOREIGN KEY("parent_id") REFERENCES "post_comment"("post_comment_id")
      );

      CREATE INDEX IF NOT EXISTS "post_comment_post_index" ON "post_comment" (
        "post_id"
      );

      CREATE INDEX IF NOT EXISTS "post_comment_author_index" ON "post_comment" (
        "author"
      );

      CREATE INDEX IF NOT EXISTS "post_comment_parent_index" ON "post_comment" (
        "parent_id"
      );

      CREATE INDEX IF NOT EXISTS "post_comment_created_index" ON "post_comment" (
        "created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_comment_post_parent_created_index" ON "post_comment" (
        "post_id", "parent_id", "created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_comment_post_parent_created_desc_index" ON "post_comment" (
        "post_id", "parent_id", "created_utc" DESC
      );

      CREATE INDEX IF NOT EXISTS "post_comment_post_parent_score_desc_index" ON "post_comment" (
        "post_id", "parent_id", "score" DESC
      );

      CREATE INDEX IF NOT EXISTS "post_comment_parent_created_index" ON "post_comment" (
        "parent_id", "created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_comment_parent_created_desc_index" ON "post_comment" (
        "parent_id", "created_utc" DESC
      );

      CREATE INDEX IF NOT EXISTS "post_comment_parent_score_desc_index" ON "post_comment" (
        "parent_id", "score" DESC
      );

      CREATE TABLE IF NOT EXISTS "media" (
        "media_id"	INTEGER,
        "duplicate_checker_ref"	TEXT NOT NULL,
        "download_path"	TEXT NOT NULL,
        "media_type" TEXT NOT NULL,
        "thumbnail_download_path"	TEXT,
        PRIMARY KEY("media_id" AUTOINCREMENT)
      );

      CREATE INDEX IF NOT EXISTS "media_duplicate_checker_ref_index" ON "media" (
        "duplicate_checker_ref"
      );

      CREATE TABLE IF NOT EXISTS "post_media" (
        "media_id"	INTEGER,
        "post_id"	TEXT,
        "post_created_utc" INTEGER,
        "is_post_latest" INTEGER,
        "is_post_latest_by_uploader" INTEGER,
        "is_post_latest_in_subreddit" INTEGER,
        "media_index" INTEGER,
        "subreddit_id"	TEXT,
        "uploader"	TEXT,
        PRIMARY KEY("post_id","media_id"),
        FOREIGN KEY("media_id") REFERENCES "media"("media_id"),
        FOREIGN KEY("post_id") REFERENCES "post"("post_id"),
        FOREIGN KEY("subreddit_id") REFERENCES "subreddit"("subreddit_id"),
        FOREIGN KEY("uploader") REFERENCES "user"("username")
      );

      CREATE INDEX IF NOT EXISTS "post_media_post_index" ON "post_media" (
        "post_id"
      );

      CREATE INDEX IF NOT EXISTS "post_media_media_index" ON "post_media" (
        "media_id"
      );

      CREATE INDEX IF NOT EXISTS "post_media_subreddit_index" ON "post_media" (
        "subreddit_id"
      );

      CREATE INDEX IF NOT EXISTS "post_media_uploader_index" ON "post_media" (
        "uploader"
      );

      CREATE INDEX IF NOT EXISTS "post_mediaid_created_index" ON "post_media" (
        "media_id", "post_created_utc"
      );

      CREATE INDEX IF NOT EXISTS "post_media_latest_created_mediaindex_index" ON "post_media" (
        "is_post_latest", "post_created_utc", "media_index"
      );

      CREATE INDEX IF NOT EXISTS "post_media_latest_created_desc_mediaindex_index" ON "post_media" (
        "is_post_latest", "post_created_utc" DESC, "media_index"
      );

      CREATE INDEX IF NOT EXISTS "post_media_subreddit_latest_created_mediaindex_index" ON "post_media" (
        "subreddit_id", "is_post_latest_in_subreddit", "post_created_utc", "media_index"
      );

      CREATE INDEX IF NOT EXISTS "post_media_subreddit_latest_created_desc_mediaindex_index" ON "post_media" (
        "subreddit_id", "is_post_latest_in_subreddit", "post_created_utc" DESC, "media_index"
      );

      CREATE INDEX IF NOT EXISTS "post_media_uploader_latest_created_mediaindex_index" ON "post_media" (
        "uploader", "is_post_latest_by_uploader", "post_created_utc", "media_index"
      );

      CREATE INDEX IF NOT EXISTS "post_media_uploader_latest_created_desc_mediaindex_index" ON "post_media" (
        "uploader", "is_post_latest_by_uploader", "post_created_utc" DESC, "media_index"
      );

      CREATE TABLE IF NOT EXISTS "env" (
        "env_key" TEXT,
        "value" TEXT,
        PRIMARY KEY("env_key")
      );

      CREATE TABLE IF NOT EXISTS "media_stats" (
        "media_id"	INTEGER,
        "post_count" NUMBER,
        PRIMARY KEY("media_id"),
        FOREIGN KEY("media_id") REFERENCES "media"("media_id")
      );

      -- v1.1.0
      CREATE TABLE IF NOT EXISTS "saved_item" (
        "item_id"	TEXT,
        "item_type" TEXT,
        "saved_by"	TEXT,
        "item_index" NUMBER,
        "details" TEXT,
        PRIMARY KEY("item_id", "item_type", "saved_by"),
        FOREIGN KEY("saved_by") REFERENCES "user"("username")
      );
      
      CREATE INDEX IF NOT EXISTS "saved_item_by_index_index" ON "saved_item" ("saved_by", "item_index");

      CREATE TABLE IF NOT EXISTS "joined_subreddit" (
        "subreddit_id" TEXT,
        "joined_by" TEXT,
        PRIMARY KEY("subreddit_id", "joined_by"),
        FOREIGN KEY("subreddit_id") REFERENCES "subreddit"("subreddit_id"),
        FOREIGN KEY("joined_by") REFERENCES "user"("username")
      );

      CREATE TABLE IF NOT EXISTS "following" (
        "username" TEXT,
        "followed_by" TEXT,
        PRIMARY KEY("username", "followed_by"),
        FOREIGN KEY("username") REFERENCES "user"("username"),
        FOREIGN KEY("followed_by") REFERENCES "user"("username")
      );
      ------------

      ${POST_FTS_INIT}
      ${SUBREDDIT_FTS_INIT}
      ${USER_FTS_INIT}
      ${POST_COMMENT_FTS_INIT}
      ${SAVED_ITEM_FTS_INIT}

      COMMIT;
    `);

  if (!dbFileExists) {
    db.prepare(`INSERT INTO env (env_key, value) VALUES (?, ?)`).run(
      'db_schema_version',
      DB_SCHEMA_VERSION
    );
  } else {
    checkDBSchemaVersion(db, logger);
  }

  return db;
}

function checkDBSchemaVersion(db: Database.Database, logger?: Logger | null) {
  const result = db
    .prepare(`SELECT value FROM env WHERE env_key = ?`)
    .get('db_schema_version') as { value: string } | undefined;
  const version = result?.value || '';
  if (version) {
    commonLog(logger, 'debug', 'DB', `DB schema version: ${version}`);
  } else {
    commonLog(
      logger,
      'warn',
      'DB',
      'Failed to obtain DB schema version. Database could be corrupted!'
    );
    return;
  }

  // Code to be added here if schema needs to be updatd
}
