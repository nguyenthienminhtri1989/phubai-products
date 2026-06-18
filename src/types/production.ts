export interface Factory {
  id: number;
  name: string;
}

export interface Process {
  id: number;
  name: string;
  factoryId: number;
  isRevenueProcess?: boolean;
}

export interface SourceProcessOption {
  id: number;
  name: string;
  revenueFactory?: { id: number; name: string } | null;
}

export interface ItemOption {
  id: number;
  name: string;
}

export interface LotOption {
  id: number;
  lotNumber: string;
  item?: { id: number; name: string } | null;
  status?: string;
}

export interface ProductionLogEntry {
  id: number;
  itemId: number;
  startIndex: number;
  endIndex: number | null;
  inputNE: number;
  finalOutput?: number;
  efficiency: number | null;
  note: string;
  item?: { id: number; name: string } | null;
  lotId?: number | null;
}

export interface MachineAssignment {
  id: number;
  machineId: number;
  itemId: number;
  item: { id: number; name: string };
  lot?: { id: number; lotNumber: string } | null;
  lotId?: number | null;
  sourceProcessId?: number | null;
  sourceProcess?: SourceProcessOption | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface MachineForInput {
  id: number;
  name: string;
  formulaType: number;
  processId: number;
  spindleCount?: number;
  currentNE?: number;
  isActive?: boolean;
  allowMultiItemPerShift?: boolean;
  currentItem?: { id: number; name: string } | null;
  currentLot?: { id: number; lotNumber: string } | null;
  currentSourceProcessId?: number | null;
  currentSourceProcess?: SourceProcessOption | null;
  todayLog?: ProductionLogEntry | null;
  todayLogs?: ProductionLogEntry[];
  itemAssignments?: MachineAssignment[];
}

export interface SessionUser {
  role?: string;
  userRole?: string;
  accessLevel?: string;
  processIds?: number[];
}

export const SHIFT_LABELS: Record<number, string> = {
  1: "Ca 1",
  2: "Ca 2",
  3: "Ca 3",
};
