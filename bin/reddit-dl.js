#!/usr/bin/env node

const {default: RedditDownloaderCLI} = require('../dist/cli/index.js');

(new RedditDownloaderCLI()).start();
