import spawn from 'cross-spawn';

let ffmpegVersion: string | null = null;

export function getFFmpegVersion(ffmpegPath?: string | null) {
  if (ffmpegVersion) {
    return ffmpegVersion;
  }

  const args = ['-version'];
  const result = spawn.sync(ffmpegPath || 'ffmpeg', args, {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.error) {
    throw result.error;
  }

  const versionLine = result.stdout.split('\n')[0];
  const versionMatch = versionLine.match(/ffmpeg version (\S+)/);
  ffmpegVersion = versionMatch ? versionMatch[1] : null;
  if (!ffmpegVersion) {
    throw new Error('No match for version string found in ffmpeg output');
  }
  return ffmpegVersion;
}
