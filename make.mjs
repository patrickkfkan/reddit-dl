import spawn from 'cross-spawn';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs-extra';
import { existsSync, mkdirSync, rmSync } from 'fs';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_NODE = 'node22';
const releasesDir = path.resolve(__dirname, 'releases');

const packageJSON = fs.readJSONSync(path.resolve(__dirname, './package.json'));
const appName = packageJSON.name;
const appVersion = packageJSON.version;
const entryFile = path.resolve(__dirname);
const platform = os.platform();
const arch = os.arch();
const release = process.argv.includes('--release');

function archive(dir, output, format) {
  return new Promise((resolve, reject) => {
    const outStream = fs.createWriteStream(output);
    let archive;
    if (format === 'zip') {
      archive = archiver('zip', { zlib: { level: 9 } });
    } else if (format === 'tar.gz') {
      archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
    } else {
      return reject(new Error(`❌ Unsupported format: ${format}`));
    }

    outStream.on('close', () => {
      resolve();
    });

    outStream.on('error', reject);
    archive.on('error', reject);

    archive.pipe(outStream);
    archive.directory(dir, false); // false = exclude root folder itself
    archive.finalize();
  });
}

async function build() {
  const target = `${TARGET_NODE}-${platform}-${arch}`;
  const outDir = path.resolve(__dirname, 'out', platform, arch);
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  const output = path.resolve(outDir, appName);
  const command = 'npx';
  const commandArgs = [
    'pkg',
    entryFile,
    '--targets',
    target,
    '--compress',
    'GZip',
    '--output',
    output
  ];
  console.log(`🚀 Building for ${platform}-${arch}`);
  try {
    spawn.sync(command, commandArgs);
    console.log(`✅ Build successful: ${output}`);
  } catch (error) {
    console.error(`❌ Build failed:`, error.message);
  }
  if (release) {
    if (!existsSync(releasesDir)) {
      mkdirSync(releasesDir, { recursive: true });
    }
    const baseName = `${appName}-${appVersion}-${platform}-${arch}`;
    let releaseFile;
    if (platform === 'linux') {
      releaseFile = path.resolve(releasesDir, `${baseName}.tar.gz`);
      await archive(outDir, releaseFile, 'tar.gz');
    } else {
      releaseFile = path.resolve(releasesDir, `${baseName}.zip`);
      await archive(outDir, releaseFile, 'zip');
    }
    console.log(`✅ Release created: ${releaseFile}`);
  }
}

build();
