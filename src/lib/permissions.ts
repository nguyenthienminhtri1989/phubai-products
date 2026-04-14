// src/lib/permissions.ts
// Hệ thống phân quyền 2 tầng: Role-Based Defaults + Page-Level Overrides

// ======================================================
// TYPES
// ======================================================

export type UserRole =
  | "ADMIN"
  | "DIRECTOR"
  | "FACTORY_MANAGER"
  | "SALES"
  | "PROCESS_LEAD"
  | "STATISTICIAN"
  | "TEAM_LEAD"
  | "VIEWER";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Quản trị hệ thống",
  DIRECTOR: "Tổng/Phó Tổng GĐ",
  FACTORY_MANAGER: "Giám đốc Nhà máy",
  SALES: "Phòng Kinh doanh",
  PROCESS_LEAD: "Trưởng công đoạn",
  STATISTICIAN: "Người thống kê",
  TEAM_LEAD: "Tổ trưởng",
  VIEWER: "Chỉ xem",
};

// Cấu trúc quyền cho 1 trang
export interface PagePerm {
  canView: boolean;
  canEdit: boolean;
}

// Thông tin user cần cho permission check
export interface PermUser {
  userRole: UserRole;
  factoryId?: number | null;
  processIds?: number[];
  // PagePermission overrides (loaded from DB)
  pagePermissions?: { pageKey: string; canView: boolean; canEdit: boolean }[];
}

// ======================================================
// MA TRẬN QUYỀN MẶC ĐỊNH THEO ROLE
// ======================================================
// Mỗi role có 1 danh sách page group mặc định được xem/sửa.
// "*" = tất cả pages.

interface RoleDefault {
  viewGroups: string[];  // Danh sách pageGroup hoặc "*" = tất cả
  editGroups: string[];  // Giới hạn chỉnh sửa
  description: string;
}

const ROLE_DEFAULTS: Record<UserRole, RoleDefault> = {
  ADMIN: {
    viewGroups: ["*"],
    editGroups: ["*"],
    description: "Full quyền",
  },
  DIRECTOR: {
    viewGroups: ["*"],
    editGroups: [],  // Không có quyền sửa mặc định — cấp qua PagePermission
    description: "Xem tất cả, sửa theo trang được gán",
  },
  FACTORY_MANAGER: {
    viewGroups: ["SẢN XUẤT", "ĐỊNH MỨC", "BÁO CÁO", "DANH MỤC", "TỔNG QUAN", "MOBILE"],
    editGroups: ["SẢN XUẤT", "ĐỊNH MỨC", "MOBILE"],
    description: "Xem/sửa NM mình, xem NM khác (data filter theo factoryId)",
  },
  SALES: {
    viewGroups: ["KINH DOANH", "TỔNG QUAN"],
    editGroups: ["KINH DOANH"],
    description: "Module Kinh doanh",
  },
  PROCESS_LEAD: {
    viewGroups: ["SẢN XUẤT", "ĐỊNH MỨC", "BÁO CÁO", "TỔNG QUAN", "MOBILE"],
    editGroups: ["SẢN XUẤT", "MOBILE"],
    description: "Xem SX tất cả CĐ, sửa CĐ mình (data filter theo processIds)",
  },
  STATISTICIAN: {
    viewGroups: ["SẢN XUẤT", "ĐIỆN NĂNG", "TỔNG QUAN", "MOBILE"],
    editGroups: ["SẢN XUẤT", "ĐIỆN NĂNG", "MOBILE"],
    description: "Nhập liệu SL + điện năng cho NM được phân công",
  },
  TEAM_LEAD: {
    viewGroups: ["SẢN XUẤT", "TỔNG QUAN", "MOBILE"],
    editGroups: ["SẢN XUẤT", "MOBILE"],
    description: "Xem CĐ mình, nhập liệu CĐ mình (data filter theo processIds)",
  },
  VIEWER: {
    viewGroups: [],
    editGroups: [],
    description: "Không có quyền mặc định — cần gán thủ công",
  },
};

// ======================================================
// PERMISSION RESOLUTION FUNCTIONS
// ======================================================

/**
 * Kiểm tra 1 pageGroup có nằm trong danh sách allowed groups hay không.
 */
function matchGroup(pageGroup: string, allowedGroups: string[]): boolean {
  if (allowedGroups.includes("*")) return true;
  return allowedGroups.includes(pageGroup);
}

/**
 * Lấy quyền mặc định cho 1 trang dựa trên Role.
 */
export function getRoleDefaultPerm(role: UserRole, pageGroup: string): PagePerm {
  const def = ROLE_DEFAULTS[role];
  return {
    canView: matchGroup(pageGroup, def.viewGroups),
    canEdit: matchGroup(pageGroup, def.editGroups),
  };
}

/**
 * Resolve quyền cuối cùng cho 1 trang cụ thể.
 * Logic ưu tiên:
 *   1. ADMIN → luôn full quyền
 *   2. Nếu có PagePermission override → dùng override
 *   3. Nếu không → dùng Role default
 */
export function resolvePagePerm(
  user: PermUser,
  pageKey: string,
  pageGroup: string
): PagePerm {
  // ADMIN bypass
  if (user.userRole === "ADMIN") {
    return { canView: true, canEdit: true };
  }

  // Check override từ PagePermission
  const override = user.pagePermissions?.find((p) => p.pageKey === pageKey);
  if (override) {
    return {
      canView: override.canView,
      canEdit: override.canEdit,
    };
  }

  // Fallback to role default
  return getRoleDefaultPerm(user.userRole, pageGroup);
}

/**
 * Kiểm tra nhanh: user có quyền xem 1 trang không?
 */
export function canViewPage(
  user: PermUser,
  pageKey: string,
  pageGroup: string
): boolean {
  return resolvePagePerm(user, pageKey, pageGroup).canView;
}

/**
 * Kiểm tra nhanh: user có quyền chỉnh sửa trên 1 trang không?
 */
export function canEditPage(
  user: PermUser,
  pageKey: string,
  pageGroup: string
): boolean {
  return resolvePagePerm(user, pageKey, pageGroup).canEdit;
}

/**
 * Kiểm tra user có quyền xem BẤT KỲ trang nào trong 1 nhóm không.
 * Dùng để show/hide group header trên sidebar.
 */
export function canViewGroup(user: PermUser, pageGroup: string): boolean {
  if (user.userRole === "ADMIN") return true;

  // Check role default
  const def = ROLE_DEFAULTS[user.userRole];
  if (matchGroup(pageGroup, def.viewGroups)) return true;

  // Check nếu có bất kỳ page override nào trong group cho phép xem
  if (user.pagePermissions?.some((p) => p.canView)) {
    // Cần biết group của page — nhưng ở đây chưa có, nên ta check ở sidebar logic
    return true;
  }

  return false;
}

/**
 * Resolve toàn bộ quyền cho tất cả trang — dùng cho UI Permission Matrix.
 * @param user - Thông tin user
 * @param allPages - Tất cả trang từ PageRegistry
 * @returns Map<pageKey, PagePerm> — quyền cuối cùng cho mỗi trang
 */
export function resolveAllPermissions(
  user: PermUser,
  allPages: { pageKey: string; pageGroup: string }[]
): Map<string, PagePerm> {
  const result = new Map<string, PagePerm>();
  for (const page of allPages) {
    result.set(page.pageKey, resolvePagePerm(user, page.pageKey, page.pageGroup));
  }
  return result;
}

/**
 * Lấy Role Defaults cho tất cả trang — dùng cho nút "Áp dụng mặc định" trên UI.
 */
export function getRoleDefaultsForAllPages(
  role: UserRole,
  allPages: { pageKey: string; pageGroup: string }[]
): Map<string, PagePerm> {
  const result = new Map<string, PagePerm>();
  for (const page of allPages) {
    result.set(page.pageKey, getRoleDefaultPerm(role, page.pageGroup));
  }
  return result;
}

// ======================================================
// HELPER: Kiểm tra quyền data-level (theo NM / CĐ)
// ======================================================

/**
 * Kiểm tra user có quyền chỉnh sửa data của 1 nhà máy cụ thể.
 * - ADMIN: luôn true
 * - FACTORY_MANAGER, STATISTICIAN: chỉ NM được gán (factoryId)
 * - DIRECTOR: phụ thuộc vào PagePermission (check page-level trước, data-level ở đây)
 */
export function canEditFactory(user: PermUser, targetFactoryId: number): boolean {
  if (user.userRole === "ADMIN") return true;
  if (user.userRole === "DIRECTOR") return false; // Director mặc định không sửa, trừ khi có PagePermission
  if (
    user.userRole === "FACTORY_MANAGER" ||
    user.userRole === "STATISTICIAN"
  ) {
    return user.factoryId === targetFactoryId;
  }
  // PROCESS_LEAD, TEAM_LEAD: dùng processIds, không check factoryId trực tiếp
  return false;
}

/**
 * Kiểm tra user có quyền chỉnh sửa data của 1 công đoạn cụ thể.
 */
export function canEditProcess(user: PermUser, targetProcessId: number): boolean {
  if (user.userRole === "ADMIN") return true;
  if (
    user.userRole === "PROCESS_LEAD" ||
    user.userRole === "TEAM_LEAD"
  ) {
    return (user.processIds ?? []).includes(targetProcessId);
  }
  // FACTORY_MANAGER có thể sửa tất cả CĐ trong NM mình — check ở caller
  if (user.userRole === "FACTORY_MANAGER") return true;
  return false;
}

// ======================================================
// BACKWARD COMPATIBILITY — Các hàm cũ (deprecated)
// ======================================================

// Mapping module cũ -> page group mới
const MODULE_TO_GROUP: Record<string, string> = {
  production: "SẢN XUẤT",
  maintenance: "SẢN XUẤT",
  energy: "ĐIỆN NĂNG",
  iot: "SẢN XUẤT",
  kdsx: "KINH DOANH",
  benchmark: "ĐỊNH MỨC",
  stops: "SẢN XUẤT",
};

/**
 * @deprecated Dùng canViewPage() thay thế
 */
export function canViewModule(
  _department: string,
  _extraModules: string[],
  _role: string,
  module: string
): boolean {
  // Backward compatibility: ADMIN always true
  if (_role === "ADMIN") return true;
  const group = MODULE_TO_GROUP[module];
  if (!group) return false;
  // Map role cũ sang role mới
  const userRole = mapLegacyRole(_role, _department);
  return matchGroup(group, ROLE_DEFAULTS[userRole].viewGroups);
}

function mapLegacyRole(role: string, department: string): UserRole {
  if (role === "ADMIN") return "ADMIN";
  return "VIEWER";
}

export type Department = string;
export type ModuleKey = string;

export const MODULE_KEYS = [
  "production",
  "maintenance",
  "energy",
  "iot",
  "kdsx",
  "benchmark",
  "stops",
] as const;

export const DEPARTMENT_LABELS: Record<string, string> = {
  FACTORY: "Nhà máy",
  MANAGEMENT: "Ban giám đốc",
  SALES: "Phòng kinh doanh",
  ACCOUNTING: "Phòng kế toán",
  WAREHOUSE: "Kho",
};

export const MODULE_LABELS: Record<string, string> = {
  production: "Sản lượng & Nhập liệu",
  maintenance: "Bảo dưỡng thiết bị",
  energy: "Quản lý điện năng",
  iot: "Import IoT Excel",
  kdsx: "Kế hoạch KD-SX",
  benchmark: "Định mức năng suất",
  stops: "Ghi nhận dừng máy",
};

export function getAvailableExtraModules(_department: string): string[] {
  return [];
}

export function canAccessKdsx(session: {
  user: { userRole?: string };
}): boolean {
  const role = (session.user.userRole ?? "VIEWER") as UserRole;
  if (role === "ADMIN") return true;
  return matchGroup("KINH DOANH", ROLE_DEFAULTS[role].viewGroups);
}

export function canAccessBenchmark(session: {
  user: { userRole?: string };
}): boolean {
  const role = (session.user.userRole ?? "VIEWER") as UserRole;
  if (role === "ADMIN") return true;
  return matchGroup("ĐỊNH MỨC", ROLE_DEFAULTS[role].viewGroups);
}
