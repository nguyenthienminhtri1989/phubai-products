"use client";

import React, { useState, useEffect } from "react";
import { Spin, Typography, Tag } from "antd";

export interface ActualGrid {
  [machineId: number]: {
    [day: number]: { [itemId: number]: number }; // itemId → kg
  };
}

const { Text } = Typography;

interface Segment {
  id: number;
  machineId: number;
  itemId: number;
  fromDay: number;
  toDay: number;
  kgPerDay: number;
  machine: { id: number; name: string; model?: string | null; processId: number };
  item: { id: number; name: string };
}

interface ActualProductionGridProps {
  scheduleId: number;
  segments: Segment[];
  holidays: number[];
  totalDays: number;
  itemColors: Record<string, string>;
  yearMonth: string;
  externalGrid?: ActualGrid;
  externalItems?: { id: number; name: string }[];
  externalBenchmarkMap?: Record<string, number>;
  externalMachines?: { id: number; name: string; model?: string | null; processId: number }[];
  onGridLoaded?: (grid: ActualGrid, source: string) => void;
}

function getColor(itemId: number, itemColors: Record<string, string>): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  const DEFAULT_COLORS = [
    "#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336",
    "#00BCD4", "#FFEB3B", "#E91E63", "#3F51B5", "#8BC34A",
    "#FF5722", "#607D8B", "#009688", "#795548", "#CDDC39", "#673AB7",
  ];
  return DEFAULT_COLORS[parseInt(String(itemId)) % DEFAULT_COLORS.length];
}
function getBg(itemId: number, itemColors: Record<string, string>): string {
  return getColor(itemId, itemColors) + "33";
}

function compareColor(actual: number, plan: number): string {
  if (plan === 0) return "#595959";
  if (actual >= plan) return "#52c41a";          // ≥100%
  if (actual >= plan * 0.95) return "#faad14";  // 95% – 99%
  return "#ff4d4f";                             // <95%
}

export default function ActualProductionGrid({
  scheduleId,
  segments,
  holidays,
  totalDays,
  itemColors,
  yearMonth,
  externalGrid,
  externalItems,
  externalBenchmarkMap,
  externalMachines,
  onGridLoaded,
}: ActualProductionGridProps) {
  const [internalGrid, setInternalGrid] = useState<ActualGrid>({});
  const [source, setSource] = useState<string>("KD_DAILY_INPUT");
  const [loadedScheduleId, setLoadedScheduleId] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [apiMachines, setApiMachines] = useState<{ id: number; name: string; model?: string | null; processId: number }[]>([]);
  const [apiItems, setApiItems] = useState<{ id: number; name: string }[]>([]);
  const [benchmarkMap, setBenchmarkMap] = useState<Record<string, number>>({});

  const grid = externalGrid ?? internalGrid;
  const resolvedBenchmarkMap = externalBenchmarkMap ?? benchmarkMap;
  const loading = !externalGrid && loadedScheduleId !== scheduleId;

  const [schedYear, schedMonth] = yearMonth.split("-").map(Number);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  useEffect(() => {
    if (externalGrid !== undefined) return;
    let cancelled = false;
    fetch(`/api/kdsx/production-schedule/${scheduleId}/actual`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const fetchedGrid = data.grid ?? {};
        const fetchedSource = data.source ?? "KD_DAILY_INPUT";
        const fetchedMachines = data.machines ?? [];
        const fetchedItems = data.items ?? [];
        setInternalGrid(fetchedGrid);
        setSource(fetchedSource);
        setApiMachines(fetchedMachines);
        setApiItems(fetchedItems);
        setBenchmarkMap(data.benchmarkMap ?? {});
        setLoadedScheduleId(scheduleId);
        onGridLoaded?.(fetchedGrid, fetchedSource);
      })
      .catch(() => {
        if (cancelled) return;
        setInternalGrid({});
        setLoadedScheduleId(scheduleId);
        onGridLoaded?.({}, "KD_DAILY_INPUT");
      });
    return () => { cancelled = true; };
  }, [scheduleId, externalGrid]);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;

  // Merge items: externalItems ưu tiên hơn apiItems (từ fetch nội bộ)
  const resolvedItems: { id: number; name: string }[] = [
    ...apiItems,
    ...(externalItems ?? []).filter(ei => !apiItems.some(ai => ai.id === ei.id)),
  ];

  // Merge machines: externalMachines (từ parent) ưu tiên hơn apiMachines (fetch nội bộ)
  // externalMachines được set khi parent dùng externalGrid — apiMachines sẽ rỗng trong TH đó
  const resolvedMachines = externalMachines && externalMachines.length > 0
    ? externalMachines
    : apiMachines;

  // ── Build GridRow hoàn toàn từ grid data (kd_daily_inputs) ──
  // Mỗi dòng = 1 combo (machineId, itemId) có SL thực tế > 0
  interface GridRow {
    machineId: number;
    itemId: number;
    machineName: string;
    machineModel: string | null;
    itemName: string;
    firstDay: number;
    lastDay: number;
  }

  const rowMap = new Map<string, GridRow>();
  for (const [machineIdStr, machineGridRaw] of Object.entries(grid)) {
    const machineId = parseInt(machineIdStr);
    const machineGrid = machineGridRaw as Record<number, Record<number, number>>;
    for (const [dayStr, dayDataRaw] of Object.entries(machineGrid)) {
      const day = parseInt(dayStr);
      const dayData = dayDataRaw as Record<number, number>;
      for (const [itemIdStr, kg] of Object.entries(dayData)) {
        const itemId = parseInt(itemIdStr);
        if ((kg as number) <= 0) continue;
        const key = `${machineId}-${itemId}`;
        if (!rowMap.has(key)) {
          const machine = resolvedMachines.find(m => m.id === machineId)
            ?? segments.find(s => s.machineId === machineId)?.machine;
          const item = resolvedItems.find(i => i.id === itemId);
          rowMap.set(key, {
            machineId,
            itemId,
            machineName: machine?.name ?? `Máy ${machineId}`,
            machineModel: machine?.model ?? null,
            itemName: item?.name ?? `Item #${itemId}`,
            firstDay: day,
            lastDay: day,
          });
        } else {
          const row = rowMap.get(key)!;
          if (day < row.firstDay) row.firstDay = day;
          if (day > row.lastDay) row.lastDay = day;
        }
      }
    }
  }

  const gridRows = Array.from(rowMap.values()).sort((a, b) =>
    a.machineId !== b.machineId ? a.machineId - b.machineId : a.firstDay - b.firstDay
  );

  // Xác định dòng cuối cùng (lastDay lớn nhất) của mỗi máy — chỉ dòng này mới điền benchmark
  const lastRowPerMachine = new Map<number, string>(); // machineId → rowKey
  for (const row of gridRows) {
    const key = `${row.machineId}-${row.itemId}`;
    const existingKey = lastRowPerMachine.get(row.machineId);
    if (!existingKey) {
      lastRowPerMachine.set(row.machineId, key);
    } else {
      const existingRow = gridRows.find(r => `${r.machineId}-${r.itemId}` === existingKey)!;
      if (row.lastDay > existingRow.lastDay) {
        lastRowPerMachine.set(row.machineId, key);
      }
    }
  }

  // Xác định ngày nào đã có ít nhất 1 bản ghi SL thực tế
  const daysWithActualData = new Set<number>();
  for (const machineIdStr of Object.keys(grid)) {
    const machineGrid = grid[parseInt(machineIdStr)];
    for (const dayStr of Object.keys(machineGrid)) {
      const day = parseInt(dayStr);
      const dayData = machineGrid[day];
      if (dayData && Object.values(dayData).some((kg) => kg > 0)) {
        daysWithActualData.add(day);
      }
    }
  }

  // Tính rowSpan cho cột Máy
  const machineRowSpan: Record<number, number> = {};
  const machineFirstSeen: Record<number, boolean> = {};
  for (const row of gridRows) {
    machineRowSpan[row.machineId] = (machineRowSpan[row.machineId] ?? 0) + 1;
  }

  // Hàng TỔNG/NGÀY — chỉ cộng định mức sau ngày cuối có SL thực tế của từng dòng
  const totalActualByDay = dayNumbers.map((day) => {
    if (holidays.includes(day)) return 0;
    let total = 0;
    for (const row of gridRows) {
      const actual = grid[row.machineId]?.[day]?.[row.itemId] ?? 0;
      const bmKey = `${row.machineId}-${row.itemId}`;
      const bmKg = resolvedBenchmarkMap[bmKey] ?? 0;
      const isLastRow = lastRowPerMachine.get(row.machineId) === `${row.machineId}-${row.itemId}`;
      total +=
        actual > 0
          ? actual
          : !daysWithActualData.has(day) && day > row.lastDay && isLastRow
            ? bmKg
            : 0;
    }
    return total;
  });
  const grandActualTotal = totalActualByDay.reduce((s, v) => s + v, 0);

  const thStyle: React.CSSProperties = {
    background: "#001529", color: "white", padding: "7px 5px",
    textAlign: "center", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 2,
    borderBottom: "2px solid #1d3557", borderRight: "1px solid #1d3557",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 5px", textAlign: "center", fontSize: 12, whiteSpace: "nowrap",
    borderRight: "1px solid #9e9e9e", borderBottom: "1px solid #bdbdbd",
  };

  return (
    <div>
      {/* Source badge */}
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <Text type="secondary">Nguồn dữ liệu: </Text>
        <Tag color="blue">KD Daily Input</Tag>
        <Text type="secondary" style={{ marginLeft: 8 }}>
          — Màu ô: <span style={{ color: "#52c41a", fontWeight: 600 }}>Xanh ≥ KH</span>,{" "}
          <span style={{ color: "#faad14", fontWeight: 600 }}>Vàng gần đạt</span>,{" "}
          <span style={{ color: "#ff4d4f", fontWeight: 600 }}>Đỏ thấp hơn 5%+</span>
          <span style={{ color: "#595959", marginLeft: 8 }}>(Không có định mức KH → màu xám)</span>
        </Text>
      </div>

      {gridRows.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#aaa", fontSize: 13 }}>
          Chưa có dữ liệu sản lượng thực tế trong tháng này.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "2px solid #b0b0b0", borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.1)" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900, width: "max-content" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: 80, position: "sticky", left: 0, zIndex: 3, textAlign: "left", paddingLeft: 8 }}>Máy</th>
                <th style={{ ...thStyle, minWidth: 110, position: "sticky", left: 80, zIndex: 3 }}>Mặt hàng</th>
                {dayNumbers.map(day => {
                  const isHoliday = holidays.includes(day);
                  return (
                    <th key={day} style={{ ...thStyle, minWidth: 38, background: isHoliday ? "#cf1322" : "#001529" }}>
                      {day}<br />
                      <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{schedMonth}/{String(schedYear).slice(2)}</span>
                    </th>
                  );
                })}
                <th style={{ ...thStyle, minWidth: 70, background: "#1d3557" }}>TỔNG</th>
              </tr>
            </thead>
            <tbody>
              {gridRows.map((row, rowIdx) => {
                const rowKey = `${row.machineId}-${row.itemId}`;
                const isFirstOfMachine = !machineFirstSeen[row.machineId];
                if (isFirstOfMachine) machineFirstSeen[row.machineId] = true;
                const span = machineRowSpan[row.machineId];
                const isSelected = selectedKey === rowKey;
                const rowBg = isSelected ? "#fffbe6" : rowIdx % 2 === 0 ? "#fff" : "#fafafa";
                const machineGrid = grid[row.machineId] ?? {};
                const itemColor = getColor(row.itemId, itemColors);

                // Tổng TH của dòng này — chỉ cộng định mức cho ngày chưa có data nào
                const bmKey = `${row.machineId}-${row.itemId}`;
                const benchmarkKgForRow = resolvedBenchmarkMap[bmKey] ?? 0;
                const isLastRowOfMachine = lastRowPerMachine.get(row.machineId) === rowKey;
                let rowTotal = 0;
                for (const day of dayNumbers) {
                  if (holidays.includes(day)) continue;
                  const actual = machineGrid[day]?.[row.itemId] ?? 0;
                  rowTotal += actual > 0
                    ? actual
                    : !daysWithActualData.has(day) && day > row.lastDay && isLastRowOfMachine
                      ? benchmarkKgForRow
                      : 0;
                }


                return (
                  <tr
                    key={rowKey}
                    style={{ background: rowBg, cursor: "pointer", outline: isSelected ? "2px solid #faad14" : undefined, outlineOffset: "-2px" }}
                    onClick={() => setSelectedKey(prev => prev === rowKey ? null : rowKey)}
                  >
                    {/* Cột Máy — rowSpan, chỉ render dòng đầu của máy */}
                    {isFirstOfMachine && (
                      <td rowSpan={span} style={{
                        ...tdStyle, textAlign: "left", paddingLeft: 8,
                        position: "sticky", left: 0, zIndex: 1,
                        background: "#f5f5f5", minWidth: 80, fontWeight: 700,
                        borderRight: "2px solid #b0b0b0", verticalAlign: "middle",
                      }}>
                        {row.machineName}
                        {row.machineModel && (
                          <div style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>{row.machineModel}</div>
                        )}
                      </td>
                    )}

                    {/* Cột Mặt hàng */}
                    <td style={{
                      ...tdStyle, position: "sticky", left: 80, zIndex: 1,
                      background: isSelected ? "#fffbe6" : getBg(row.itemId, itemColors),
                      minWidth: 110, borderRight: "2px solid #b0b0b0",
                    }}>
                      <div style={{ fontSize: 12, color: itemColor, fontWeight: 700 }}>{row.itemName}</div>
                      <div style={{ fontSize: 10, color: "#888" }}>({row.firstDay}–{row.lastDay})</div>
                    </td>

                    {/* Ô ngày */}
                    {dayNumbers.map(day => {
                      const isHoliday = holidays.includes(day);
                      const actualKg = machineGrid[day]?.[row.itemId] ?? 0;
                      const hasActualData = actualKg > 0;
                      const bmKey = `${row.machineId}-${row.itemId}`;
                      const benchmarkKg = resolvedBenchmarkMap[bmKey] ?? 0;
                      const isBenchmarkFill =
                        !hasActualData &&
                        benchmarkKg > 0 &&
                        !daysWithActualData.has(day) &&
                        day > row.lastDay &&
                        isLastRowOfMachine;
                      const displayKg = hasActualData ? actualKg : isBenchmarkFill ? benchmarkKg : 0;
                      const hasAnyValue = displayKg > 0;

                      if (isHoliday) {
                        return (
                          <td key={day} style={{ ...tdStyle, background: "#ffebe8", borderLeft: "1px solid #d0d0d0" }}>
                            <span style={{ color: "#aaa", fontSize: 11 }}>—</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={day}
                          style={{
                            ...tdStyle,
                            background: isBenchmarkFill
                              ? "#f0f0f0" // xám nhạt cho ô định mức
                              : hasActualData
                                ? getBg(row.itemId, itemColors)
                                : undefined,
                            borderLeft: "1px solid #d0d0d0",
                          }}
                        >
                          {hasAnyValue ? (
                            <div>
                              <span
                                style={{
                                  color: isBenchmarkFill
                                    ? "#aaa" // xám cho định mức
                                    : benchmarkKg > 0
                                      ? compareColor(actualKg, benchmarkKg)
                                      : "#595959",
                                  fontSize: 11,
                                  fontWeight: isBenchmarkFill ? 400 : 800,
                                  fontStyle: isBenchmarkFill ? "italic" : "normal",
                                }}
                              >
                                {displayKg.toLocaleString()}
                              </span>
                              {hasActualData && benchmarkKg > 0 && (
                                <div style={{ fontSize: 9, color: "#666", fontWeight: 500 }}>
                                  ({benchmarkKg.toLocaleString()})
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "#d9d9d9", fontSize: 13 }}>·</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Cột TỔNG */}
                    <td style={{ ...tdStyle, background: "#dbeeff", fontWeight: 800, fontSize: 13, color: "#0050b3", borderLeft: "2px solid #b0b0b0" }}>
                      {rowTotal > 0 ? `${rowTotal.toLocaleString()} kg` : <span style={{ color: "#bbb" }}>—</span>}
                    </td>
                  </tr>
                );
              })}

              {/* Hàng tổng cuối */}
              <tr style={{ background: "#001529" }}>
                <td style={{ ...tdStyle, color: "white", fontWeight: 700, position: "sticky", left: 0, zIndex: 1, background: "#001529", textAlign: "left", paddingLeft: 8 }}>TỔNG TH</td>
                <td style={{ ...tdStyle, color: "white", position: "sticky", left: 80, zIndex: 1, background: "#001529" }}>kg/ngày</td>
                {totalActualByDay.map((kg, i) => {
                  const day = i + 1;
                  const isHoliday = holidays.includes(day);
                  return (
                    <td key={day} style={{ ...tdStyle, fontWeight: 600, fontSize: 10, background: isHoliday ? "#434343" : "#1d3557", color: isHoliday ? "#888" : "#52c41a" }}>
                      {isHoliday ? "—" : kg > 0 ? `${kg.toLocaleString()} kg` : "·"}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, background: "#1d3557", color: "#52c41a", fontWeight: 800, fontSize: 13 }}>
                  {grandActualTotal.toLocaleString()} kg
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
