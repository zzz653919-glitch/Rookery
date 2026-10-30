import { bad } from '../http.mjs';

export function paging(query, { max = 100, def = 20 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(max, Math.max(1, parseInt(query.pageSize, 10) || def));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
export const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
export function mustConfirm(query, id) {
  if (query.confirm !== id) throw bad('Deleting requires confirmation. Send ?confirm=<id>.');
}
export const problemsError = (P) => bad('Please fix the highlighted fields.', P.list);
