/** Validate the database / record name */
export function isClean(str: string) {
  return !/[^A-Za-z0-9_-]/g.test(str);
}
