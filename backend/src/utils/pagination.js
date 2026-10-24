/**
 * @param {Record<string, unknown>} query
 * @param {{ page?: number, pageSize?: number, maxPageSize?: number }} [defaults]
 */
export function parsePagination(query, defaults = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? ''), 10) || defaults.page || 1);
  const maxPageSize = defaults.maxPageSize ?? 100;
  const rawSize = Number.parseInt(String(query.pageSize ?? ''), 10) || defaults.pageSize || 20;
  const pageSize = Math.min(maxPageSize, Math.max(1, rawSize));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/**
 * @param {string|undefined} sortBy
 * @param {string|undefined} sortDir
 * @param {string[]} whitelist
 * @param {string} [defaultCol]
 */
export function parseSort(sortBy, sortDir, whitelist, defaultCol = 'created_at') {
  const col = sortBy && whitelist.includes(sortBy) ? sortBy : defaultCol;
  const dir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { col, dir };
}

/**
 * Multi-column sort: sortBy=a,b&sortDir=asc,desc
 * @param {string|undefined} sortBy
 * @param {string|undefined} sortDir
 * @param {string[]} whitelist
 * @param {{ col: string, dir: 'ASC'|'DESC' }[]} fallback
 */
export function parseMultiSort(sortBy, sortDir, whitelist, fallback) {
  if (!sortBy || !sortBy.includes(',')) {
    const single = parseSort(sortBy, sortDir, whitelist, fallback[0]?.col);
    return [{ col: single.col, dir: single.dir }];
  }
  const cols = sortBy.split(',').map((s) => s.trim());
  const dirs = (sortDir || '').split(',').map((s) => s.trim());
  const parts = [];
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (!whitelist.includes(col)) continue;
    const dir = String(dirs[i] || dirs[0] || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    parts.push({ col, dir });
  }
  return parts.length ? parts : fallback;
}

/**
 * Build an ORDER BY fragment. Supports qualified columns (`s.created_at`) —
 * wrapping the whole string in one pair of backticks would make MySQL look
 * for a column literally named `s.created_at`.
 * @param {{ col: string, dir: 'ASC'|'DESC' }[]} parts
 */
export function sortClause(parts) {
  return parts
    .map(({ col, dir }) => {
      const qualified = String(col)
        .split('.')
        .map((part) => `\`${part.replace(/`/g, '')}\``)
        .join('.');
      return `${qualified} ${dir}`;
    })
    .join(', ');
}
