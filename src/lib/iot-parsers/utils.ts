// Hàm tiện ích dùng chung cho tất cả IoT parsers

// Built-in shift names — không cần khai báo trong mapping
export const BUILTIN_SHIFT_MAP: Record<string, number> = {
  "ca 1": 1, "ca1": 1, "shift 1": 1,
  "ca 2": 2, "ca2": 2, "shift 2": 2,
  "ca 3": 3, "ca3": 3, "shift 3": 3,
};

/** Chuẩn hóa chuỗi: lowercase + bỏ dấu tiếng Việt + trim */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse ngày từ chuỗi → "YYYY-MM-DD" hoặc null */
export function parseDate(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // dd-mm-yyyy
  const dmyd = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyd) return `${dmyd[3]}-${dmyd[2].padStart(2, "0")}-${dmyd[1].padStart(2, "0")}`;
  // yyyy/mm/dd
  const ymd = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  // "Apr/01/2026" (format của máy đánh ống)
  const mdy = s.match(/^([A-Za-z]{3})\/(\d{2})\/(\d{4})$/);
  if (mdy) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = months[mdy[1].toLowerCase()];
    if (mm) return `${mdy[3]}-${mm}-${mdy[2]}`;
  }
  return null;
}

/** Parse ca từ chuỗi → số hoặc null */
export function parseShift(raw: string, customShiftMap: Record<string, number>): number | null {
  const key = raw.trim().toLowerCase();
  if (BUILTIN_SHIFT_MAP[key] !== undefined) return BUILTIN_SHIFT_MAP[key];
  return customShiftMap[raw.trim()] ?? null;
}

/** Parse số sản lượng */
export function parseOutput(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  return parseFloat(raw.replace(/,/g, "").trim()) || 0;
}

/** Từ khóa nhận diện dòng tổng/summary để bỏ qua */
export const SUMMARY_KEYWORDS = ["tong cong", "total", "tong", "subtotal", "grand total"];

export function isSummaryRow(firstCell: string): boolean {
  const n = normalize(firstCell);
  return SUMMARY_KEYWORDS.some((k) => n.includes(k));
}
