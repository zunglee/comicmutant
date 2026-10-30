/**
 * Commons photos live under /assets/photos so the static server sends them `immutable, 1y`
 * (replace a photo by giving it a new file name). Each has a 320w variant for cards.
 */
export function photoSrc(file: string): string {
  return `/assets/photos/${file}`;
}

export function photoSrcSet(file: string): string {
  const small = file.replace(/\.webp$/, '-320.webp');
  return `/assets/photos/${small} 320w, /assets/photos/${file} 640w`;
}
