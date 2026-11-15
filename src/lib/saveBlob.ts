const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function safeFilename(name: string): string {
  return name.replace(UNSAFE_FILENAME_CHARS, '_').trim() || 'download';
}

export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename(filename);
  link.click();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  // Revoking synchronously cancels the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
