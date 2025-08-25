import { IMAGE_URL, PREVIEW_IMAGE_URL, SITE_URL } from './Constants';

export function normalizeRedditImageURL(url: string) {
  const urlObj = new URL(url);
  if (urlObj.origin === PREVIEW_IMAGE_URL || urlObj.origin === IMAGE_URL) {
    return `${IMAGE_URL}${urlObj.pathname}`;
  }
  return url;
}

export function validateURL(url: string, base: string) {
  try {
    const urlObj = new URL(url, base);
    return urlObj.toString();
  } catch (_error) {
    return false;
  }
}

export function getPostIdFromURL(url: string) {
  const validatedURL = validateURL(url, SITE_URL);
  if (!validatedURL) {
    return null;
  }
  const regex =
    /(?:http|https):\/\/www\.reddit\.com\/(?:r|user)\/(?:.+)\/comments\/(.+?)\/(?:.+)?/;
  const match = validatedURL.match(regex);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}
