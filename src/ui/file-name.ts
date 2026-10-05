/** The last part of `path`, the name of the file or directory it leads to, by either platform's separator. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
