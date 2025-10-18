import spawn from 'cross-spawn';
import semver from 'semver';

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
  const rawVersionString = versionMatch ? versionMatch[1] : null;
  if (!rawVersionString) {
    throw new Error('No match for version string found in ffmpeg output');
  }
  ffmpegVersion = semver.coerce(rawVersionString)?.version || null;
  if (!ffmpegVersion) {
    throw new Error(
      `Could not obtain semver from version string "${rawVersionString}"`
    );
  }
  return ffmpegVersion;
}
