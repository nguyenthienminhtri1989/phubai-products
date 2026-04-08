// src/lib/permissions.ts
// Module phân quyền theo bộ phận — dùng chung cho cả frontend và backend

export type Department =
  | "FACTORY"
  | "MANAGEMENT"
  | "SALES"
  | "ACCOUNTING"
  | "WAREHOUSE";

// Danh sách các module key hợp lệ trong hệ thống
export const MODULE_KEYS = [
  "production",
  "maintenance",
  "energy",
  "iot",
  "kdsx",
  "benchmark",
  "stops",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// Ma trận quyền mặc định theo department
// Định nghĩa những module nào user trong department đó có thể xem mặc định
const DEPARTMENT_MODULES: Record<Department, ModuleKey[]> = {
  FACTORY: ["production", "maintenance", "energy", "iot", "stops"],
  MANAGEMENT: [
    "production",
    "maintenance",
    "energy",
    "iot",
    "kdsx",
    "benchmark",
    "stops",
  ],
  SALES: ["kdsx"],
  ACCOUNTING: ["kdsx", "energy"],
  WAREHOUSE: [],
};

/**
 * Kiểm tra user có quyền xem module không.
 * Logic ưu tiên:
 * 1. ADMIN → luôn có quyền
 * 2. Department mặc định có module → có quyền
 * 3. extraModules chứa module → có quyền
 */
export function canViewModule(
  department: Department,
  extraModules: string[],
  role: string,
  module: ModuleKey
): boolean {
  if (role === "ADMIN") return true;
  const base = DEPARTMENT_MODULES[department] ?? [];
  return base.includes(module) || extraModules.includes(module);
}

/**
 * Lấy danh sách module mà user có thể được cấp thêm quyền
 * (tức là các module KHÔNG có sẵn trong department mặc định)
 * Dùng cho UI checkbox "Cho phép xem thêm"
 */
export function getAvailableExtraModules(department: Department): ModuleKey[] {
  const base = DEPARTMENT_MODULES[department] ?? [];
  return MODULE_KEYS.filter((m) => !base.includes(m));
}

// Label hiển thị cho UI chọn department
export const DEPARTMENT_LABELS: Record<Department, string> = {
  FACTORY: "Nhà máy",
  MANAGEMENT: "Ban giám đốc",
  SALES: "Phòng kinh doanh",
  ACCOUNTING: "Phòng kế toán",
  WAREHOUSE: "Kho",
};

// Label hiển thị cho UI chọn extraModules
export const MODULE_LABELS: Record<ModuleKey, string> = {
  production: "Sản lượng & Nhập liệu",
  maintenance: "Bảo dưỡng thiết bị",
  energy: "Quản lý điện năng",
  iot: "Import IoT Excel",
  kdsx: "Kế hoạch KD-SX",
  benchmark: "Định mức năng suất",
  stops: "Ghi nhận dừng máy",
};

// ---------------------------------------------------------
// Server-side helpers: dùng trong API route handlers
// ---------------------------------------------------------

/**
 * Kiểm tra user có quyền truy cập module kdsx không.
 * Dùng trực tiếp với session object từ NextAuth.
 */
export function canAccessKdsx(session: {
  user: { role?: string; department?: string; extraModules?: string[] };
}): boolean {
  const { role, department, extraModules = [] } = session.user as {
    role?: string;
    department?: string;
    extraModules?: string[];
  };
  if (role === "ADMIN") return true;
  const dep = (department ?? "FACTORY") as Department;
  return canViewModule(dep, extraModules, role ?? "USER", "kdsx");
}

/**
 * Kiểm tra user có quyền truy cập module benchmark không.
 */
export function canAccessBenchmark(session: {
  user: { role?: string; department?: string; extraModules?: string[] };
}): boolean {
  const { role, department, extraModules = [] } = session.user as {
    role?: string;
    department?: string;
    extraModules?: string[];
  };
  if (role === "ADMIN") return true;
  const dep = (department ?? "FACTORY") as Department;
  return canViewModule(dep, extraModules, role ?? "USER", "benchmark");
}
