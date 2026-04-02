/**
 * Tính năng suất lý thuyết (kg/ca)
 * Dùng chung cho API backend và frontend preview
 */

export interface CalcTheoreticalOutputParams {
  speedValue: number         // Tốc độ (v/p hoặc m/p)
  speedUnit: "rpm" | "mpm"   // rpm = vòng/phút, mpm = mét/phút
  nm: number                 // Chỉ số Nm
  twist?: number             // Độ săn x/m (bắt buộc với rpm)
  spindleOrHeadCount?: number // Số cọc (máy sợi con/thô) hoặc số đầu ra (máy ghép/ống)
}

const SHIFT_MINUTES = 480 // 8 giờ × 60 phút

export function calcTheoreticalOutput(params: CalcTheoreticalOutputParams): number {
  const { speedValue, speedUnit, nm, twist, spindleOrHeadCount } = params

  if (speedUnit === "rpm") {
    // Máy sợi con, máy thô: speed là vòng/phút
    // NS_LT = speed × 480 / (twist × Nm × 1000) × spindleCount
    if (!twist || !spindleOrHeadCount) {
      throw new Error("Máy loại rpm (sợi con/thô) cần có twist và spindleCount")
    }
    return (speedValue * SHIFT_MINUTES) / (twist * nm * 1000) * spindleOrHeadCount
  } else {
    // Máy ghép, máy ống: speed là m/phút
    // NS_LT = speed × 480 / (Nm × 1000) × headCount
    const headCount = spindleOrHeadCount ?? 1
    return (speedValue * SHIFT_MINUTES) / (nm * 1000) * headCount
  }
}
