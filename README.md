<a href='https://ko-fi.com/C0C5RGOOP' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

# reddit-dl

A console application for downloading Reddit content.

## Features

- Downloads:
  - posts submitted by a specific user
  - posts from a subreddit
  - individual posts
- Supports account-specific content:
  - saved posts and comments
  - posts from subreddits you've joined
  - posts by users you're following
- For each post, downloaded content includes:
  - body text of the post 
  - Reddit-hosted images, galleries and videos
  - Redgif videos
  - comments
  - author details
- Supports downloading through proxy server
- Browse downloaded content in a web browser

## Installation

[Download the release](https://github.com/patrickkfkan/reddit-dl/releases) suitable for your system. Linux and Windows x64 versions are provided. If you are on a different system, you may [run or build the app from source](#running--building-the-app-from-source).

If you are going to download videos, you must also install [FFmpeg](https://www.ffmpeg.org/).

After downloading the release package, unpack it to obtain the `reddit-dl` executable. You might want to add the executable to the system PATH for convenience.

## Quick start

To download Reddit content, run `reddit-dl` in a terminal:

```
// Download posts submitted by user "johndoe" to the current directory
$ reddit-dl "u/johndoe"

// Download posts + comments from subreddit "funny" to "C:\Reddit-Stuff";
// also download author details for each post
$ reddit-dl -o "C:\Reddit-Stuff" --comments --post-authors "r/funny"

// Download a single post
$ reddit-dl "https://www.reddit.com/r/<subreddit>>/comments/<post_id>/<slug>/"

// Download your saved posts / comments
// Note usage of -x option, which is required when downloading account-specific content.
$ reddit-dl -x auth.conf "my/saved"

// Download posts from subreddits you've joined
$ reddit-dl -x auth.conf "my/joined"

// Download posts by users you're following
$ reddit-dl -x auth.conf "my/following"

// Download all targets in "targets.txt"
$ reddit-dl targets.txt

// targets.txt
--------------------
u/johndoe
r/funny
r/audiophile
```

To browse downloaded content:

```
// If content was downloaded to the current directory
$ reddit-dl --browse

// If content was downloaded to "C:\Reddit-Stuff"
$ reddit-dl --browse -i "C:\Reddit-Stuff"

// Output
...
Web server is running on <URL>
```

Then, in a browser, open `<URL>` to view the downloaded content.

## Usage

Display usage guide:

```
$ reddit-dl -h
```

### Download

```
$ reddit-dl [OPTION]... TARGET or FILE 
```

| Target | Downloads |
|-------|-----------|
| `r/<subreddit>` | Posts from subreddit |
| `u/<username>`   | Posts by user |
| `https://www.reddit.com/r/<subreddit>/comments/<post_id>/<slug>/` | Single post from subreddit |
| `https://www.reddit.com/user/<username>/comments/<post_id>/<slug>/` | Single post by user |
| `p/<post_id>` | Single post identified by `post_id` |
| `my/saved`<sup>*</sup> | Your saved posts / comments |
| `my/joined`<sup>*</sup> | Posts from subreddits you've joined |
| `my/following`<sup>*</sup> | Posts by users you're following |
| `previous/<flags>`| Download previous targets matching `flag`, which can be:<ul><li>`r`: previous "subreddit" targets</li><li>`u`: previous "user" targets</li><li>`p`: previous "post" targets</li><li>`s`: previous "my/saved" targets</li><li>`j`: previous "my/joined" targets</li><li>`f`: previous "my/following" targets</li></ul> Combine `r`, `u`, `p`, `s`, `j` and `f` to specify multiple previous target types. See [Downloading new content since last download](#downloading-new-content-since-last-download) for example usage.</p> |

<sup>*</sup> Requires authentication; see [Account specific content](#account-specific-content).

#### Multiple targets

Multiple targets may be provided in a file. The file must be in plain text format with each target placed on its own line. Lines starting with `#` are ignored.

```
$ reddit-dl targets.txt

// targets.txt
--------------------
u/johndoe
r/funny
# This line is ignored
r/audiophile
```


#### Account-specific content

The following targets relate to account-specific content:

- `my/saved`
- `my/joined`
- `my/following`
- `previous/...` used with `s`, `j` or `f` flags

To download from these targets, you need to be [authenticated](#authentication). The content downloaded will be specific to the account associated with the authentication credentials. You can pass different credentials each time you run `reddit-dl` to download from different accounts.


#### Download options

| Option  | Alias | Description |
|---------|-------|-------------|
| `--data-dir <dir>` | `-o` | Path to directory where content is saved.<br/>Default: current working directory |
| `--auth <file>` | `-x` | Path to file containing credentials required for authentication (see [Authentication](#authentication)). |
| `--limit <number>` | `-n` | The maximum number of items to download. |
| `--after` | `-a` | Download posts created on or after the specified date/time. See [Date range](#date-range). |
| `--before` | `-b` | Download posts created before (but not on) the specified date/time. See [Date range](#date-range). |
| `--comments` | | Fetch post comments (may lead to high API usage). See [Comments](#comments). |
| `--post-authors` | | Fetch author details when downloading posts from multiple users (may lead to high API usage). See [Post authors](#post-authors). |
| `--overwrite` | `-w` | Overwrite existing content. |
| `--overwrite-deleted` | | Overwrite even when newer content is marked as deleted. |
| `--continue` | `-e` | Stop on encountering previously downloaded content. |
| `--no-save-target` | | Do not save target to database, so it won't appear in the target list when browsing downloaded content. |
| `--max-retries <number>` | `-r` | Maximum retry attempts when a download fails. Default: `3` |
| `--max-concurrent <number>` | `-c` | Maximum number of concurrent downloads. Default: `10` |
| `--min-time <milliseconds>` | `-p` | Minimum time to wait between fetch requests. Default: `200` |
| `--timeout <seconds>` | `-t` | Minimum time to wait before aborting a request. Default: `60` |
| `--proxy <URI>` | | Use the specified proxy. `<URI>` follows this scheme: <p>`protocol://[username:[password]]@host:port`</p><p>`protocol` can be `http`, `https`, `socks4` or `socks5`.</p> |
| `--proxy-insecure` | | Do not reject invalid certificate when connecting to proxy through SSL / TLS. Use this option for proxies with self-signed certs. |
| `--log-level <level>` | `-l` | Log level: `info`, `debug`, `warn` or `error`; set to `none` to disable logging. Default: `info` |
| `--log-file <path>` | `-s` | Save logs to `<path>.` |
| `--ffmpeg <path>` | | Path to FFmpeg executable. You do not have to set this if `ffmpeg` is already in the system path. |
| `--no-prompt` | `-y` | Do not prompt for confirmation to proceed. |

#### Downloading new content since last download

Use the `--continue` option:

```
// Download posts from subreddit "funny" and stop on encountering previously-downloaded post
$ reddit-dl --continue "r/funny"
```

Say you have downloaded from multiple subreddits and users over time. To fetch new content from all of them, simply do this:

```
// Fetch new content from both subreddits and users
$ reddit-dl --continue "previous/ru"

// Just for users, not subreddits
$ reddit-dl --continue "previous/u"
```

With the `--continue` option, you may omit `TARGET` completely to download from all previous targets:

```
$ reddit-dl --continue
```

#### Authentication

`reddit-dl` retrieves content primarily through API requests. However, Reddit enforces rate limits, restricting the number of requests within a given timeframe. Once the limit is reached, `reddit-dl` will pause downloads until it resets.
                                                                                
Authentication provides access to a higher API rate limit. In addition, it enables downloading [account-specific content](#account-specific-content). To authenticate, register as a developer on Reddit (you can use your existing account) and obtain the required credentials. These credentials should be stored in a file and passed to `reddit-dl` using the `--auth` / `-x` option.
                                                                               
You will find detailed instructions in the [sample auth file](./auth.conf).

#### Date range

Use the `--after` and `--before` options to limit downloaded posts by date/time. The date/time value should be provided in format `yyyy-MM-dd HH:mm` or `yyyy-MM-dd`. E.g.:

```
// Download posts from subreddit "funny" that were created
// on or after 20 June 2025, 1pm 
$ reddit-dl "r/funny" --after "2025-06-20 13:00"

// Download posts created between 20 Jun 2025, 1pm and 20 July 2025
$ reddit-dl "r/funny" --after "2025-06-20 13:00" --before "2025-07-20"
```

Keep in mind that the value for `--after` is treated as inclusive, meaning posts created on or after the specified date/time will be downloaded. In contrast, `--before` is treated as exclusive, meaning posts created on the exact specified date/time will *not* be downloaded.

#### Comments

By default, `reddit-dl` does not retrieve post comments to minimize API usage. To enable comment fetching, use the `--comments` option. To access *all* comments on a post, you must also be authenticated (see [Authentication](#authentication)). Without authentication, full access to comments may be restricted.

#### Post authors

By default, `reddit-dl` skips fetching author details when downloading posts from multiple users. To override this behavior, use the `--post-authors` option. Keep in mind that enabling this option may result in high API usage.

### Browse downloaded content

```
$ reddit-dl --browse [OPTION]

...Web server is running on <URL>
```

This starts a web server accessible by `<URL>`. Open `<URL>` in a browser to view the downloaded content.

Browse options:

| Option | Alias | Description |
|--------|-------|-------------|
| `--data-dir <dir>` | `-i` | Path to directory of downloaded content. <br/>Default: current working directory |
| `--port <number>` | `-p` | Web server port.<br/>Default: `3000`, or a random port if `3000` is already in use. |
| `--log-level <level>`| `-l` | Log level: `info`, `debug`, `warn` or `error`; set to `none` to disable logging. Default: `info` |
| `--log-file <path>` | `-s` | Save logs to `<path>` |

## Running / building the app from source

You need [Node JS](https://nodejs.org) v22.14.0 or higher.

Building and running the app:
```
$ git clone https://github.com/patrickkfkan/reddit-dl.git
$ cd reddit-dl
$ npm i
$ npm run build
$ ./bin/reddit-dl.js ...
```

To create an executable for your OS:

```
$ npm run make

// Executable saved to ./out
```

## Changelog

v1.1.2
- Fix media access for dotfiles ([@yawkat](https://github.com/patrickkfkan/reddit-dl/pull/4))
- Sort subreddit names case-insensitively ([@yawkat](https://github.com/patrickkfkan/reddit-dl/pull/5))
- Fix parser missing high-res hosted video source

v1.1.1
- Fix pinned posts causing `--continue` option to prematurely end target.
- For multiple targets, continue to next one in the event one fails.
- Fix missing database logs when `--continue` option used without specifying target.

v1.1.0
- New targets for downloading account-specific content
- Add `--timeout` option
- (browse) Fix path traversal vulnerability in media file requests

v1.0.0
- Initial release

## License

This project is licensed under the MIT License and includes third-party software—see the [NOTICE](./NOTICE) file for attributions.