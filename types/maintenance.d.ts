// src/types/maintenance.ts
import { MaintenanceTask, Machine, Process } from "@prisma/client";

// 1. Định nghĩa kiểu dữ liệu trả về từ API (bao gồm cả quan hệ Machine và Process)
export type MaintenanceTaskWithMachine = MaintenanceTask & {
  machine: Machine & {
    process?: Process | null; // Dấu ? vì có thể process bị null tùy data
  };
};

// 2. Định nghĩa kiểu dữ liệu Form nhập liệu (Payload gửi lên API)
export type CreateMaintenanceTaskInput = {
  machineId: number; // Lưu ý: Schema của bạn Machine ID là Int
  taskName: string;
  description?: string;
  intervalMonths: number;
  nextDueDate: string | Date; // Frontend gửi string ISO, Backend chuyển thành Date
  leadTimeDays?: number;
};

// 3. Định nghĩa kiểu dữ liệu Form hoàn thành bảo dưỡng
export type CompleteMaintenanceTaskInput = {
  taskId: string;
  performedBy: string;
  performedDate: string | Date;
  notes?: string;
  cost?: number;
};
