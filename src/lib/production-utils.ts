import dayjs, { Dayjs } from "dayjs";

export const YARN_CONSTANT = 1.693;

/**
 * Tính sản lượng theo formulaType của máy.
 * Type 1: nhập kg trực tiếp (endIndex = kg)
 * Type 2: endIndex - startIndex
 * Type 3: (delta * spindleCount) / (NE * 1000 * 1.693)
 * Type 4: delta / NE
 */
export function calcOutput(params: {
  formulaType: number;
  startIndex: number;
  endIndex: number | null | undefined;
  spindleCount?: number | null;
  inputNE?: number | null;
  isStopped?: boolean;
}): number {
  const { formulaType, startIndex, endIndex, spindleCount, inputNE, isStopped } = params;

  if (isStopped) return 0;
  if (endIndex === null || endIndex === undefined || isNaN(Number(endIndex))) return 0;

  const end = Number(endIndex);
  const start = Number(startIndex) || 0;
  const delta = end - start;
  let result = 0;

  if (formulaType === 1) result = end;
  else if (formulaType === 2) result = delta;
  else if (formulaType === 3) {
    const ne = Number(inputNE) || 1;
    const spindles = spindleCount || 1;
    const denom = ne * 1000 * YARN_CONSTANT;
    if (denom !== 0) result = (delta * spindles) / denom;
  } else if (formulaType === 4) {
    const ne = Number(inputNE) || 1;
    if (ne !== 0) result = delta / ne;
  }

  const rounded = Math.round(result);
  return isNaN(rounded) ? 0 : rounded;
}

/**
 * Auto-detect ca làm việc và ngày sản xuất theo giờ hiện tại.
 * Ca 1: 13:00–20:59 → ngày hiện tại
 * Ca 2: 21:00–04:59 → ngày hiện tại (21-24h) hoặc ngày hôm trước (0-5h)
 * Ca 3: 05:00–12:59 → ngày hiện tại
 */
export function detectShiftAndDate(): { shift: number; date: Dayjs } {
  const now = dayjs();
  const hour = now.hour();

  if (hour >= 13 && hour < 21) {
    return { shift: 1, date: now };
  } else if (hour >= 21) {
    return { shift: 2, date: now };
  } else if (hour >= 0 && hour < 5) {
    return { shift: 2, date: now.subtract(1, "day") };
  } else {
    return { shift: 3, date: now };
  }
}
