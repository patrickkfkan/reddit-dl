export interface Downloaded {
  path: string;
  duplicateCheckerRef: string;
}

export interface DownloadableImage {
  src: string;
  downloaded?: Downloaded | null;
}
