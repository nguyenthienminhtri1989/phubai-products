/**
 * naturalSort.ts
 * Utility functions cho sắp xếp "natural sort" — sắp xếp chuỗi có chứa số
 * theo đúng thứ tự số thay vì thứ tự từ điển.
 *
 * Ví dụ: ["Máy số 1", "Máy số 10", "Máy số 2"] → ["Máy số 1", "Máy số 2", "Máy số 10"]
 */

/**
 * So sánh hai tên máy theo thứ tự số tự nhiên (natural sort).
 *
 * Thuật toán:
 * 1. Tách chuỗi thành các phân đoạn (số và text xen kẽ nhau)
 * 2. So sánh từng phân đoạn: nếu cả hai là số → so sánh số, ngược lại so sánh text
 * 3. Hỗ trợ đầy đủ Unicode/tiếng Việt qua `localeCompare`
 *
 * @example
 * // Sắp xếp mảng tên máy
 * machines.sort((a, b) => naturalSortBy(a.name, b.name));
 *
 * // Dùng trong Ant Design Table sorter
 * sorter: (a, b) => naturalSortBy(a.machine.name, b.machine.name)
 */
export function naturalSortBy(a: string, b: string): number {
  // Tách chuỗi thành các token: số nguyên dương và chuỗi không-số
  const tokenize = (s: string): Array<string | number> =>
    s
      .split(/(\d+)/)
      .filter(Boolean)
      .map((t) => (/^\d+$/.test(t) ? parseInt(t, 10) : t));

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const len = Math.max(tokensA.length, tokensB.length);

  for (let i = 0; i < len; i++) {
    const ta = tokensA[i];
    const tb = tokensB[i];

    // Một bên ngắn hơn → bên ngắn hơn xếp trước
    if (ta === undefined) return -1;
    if (tb === undefined) return 1;

    if (typeof ta === "number" && typeof tb === "number") {
      // Cả hai là số → so sánh số
      if (ta !== tb) return ta - tb;
    } else if (typeof ta === "string" && typeof tb === "string") {
      // Cả hai là chuỗi → so sánh unicode (hỗ trợ tiếng Việt)
      const cmp = ta.localeCompare(tb, "vi", { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    } else {
      // Khác loại: số trước chuỗi
      return typeof ta === "number" ? -1 : 1;
    }
  }

  return 0;
}

/**
 * Tạo comparator dùng cho Array.sort() với key extractor.
 *
 * @example
 * // Sắp xếp mảng object theo field name
 * machines.sort(naturalSortComparator((m) => m.name));
 *
 * // Sắp xếp với nhiều tiêu chí (stopped first, sau đó natural sort tên)
 * [...machines].sort((a, b) => {
 *   const stopFirst = (getStop(a) ? 0 : 1) - (getStop(b) ? 0 : 1);
 *   if (stopFirst !== 0) return stopFirst;
 *   return naturalSortBy(a.name, b.name);
 * });
 */
export function naturalSortComparator<T>(
  keyFn: (item: T) => string
): (a: T, b: T) => number {
  return (a, b) => naturalSortBy(keyFn(a), keyFn(b));
}

/**
 * @deprecated Dùng `naturalSortBy` thay thế.
 * Giữ lại để tương thích ngược với code cũ trong kd-daily-input/report/page.tsx
 */
export function naturalSortMachineName(a: string, b: string): number {
  return naturalSortBy(a, b);
}
