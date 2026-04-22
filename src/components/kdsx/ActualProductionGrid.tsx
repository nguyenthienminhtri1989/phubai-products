"use client";

import React, { useState, useEffect } from "react";
import { Spin, Typography, Tag } from "antd";

export interface ActualGrid {
  [machineId: number]: {
    [day: number]: { itemId: number; kg: number };
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
  isManualKg: boolean;
  machine: { id: number; name: string; model?: string | null; processId: number };
  item: { id: number; name: string };
  benchmark?: { empiricalOutputPerDay: number | null } | null;
}

interface ActualProductionGridProps {
  scheduleId: number;
  segments: Segment[];
  holidays: number[];
  totalDays: number;
  itemColors: Record<string, string>;
  yearMonth: string;
  /** Nếu được truyền từ parent, dùng grid này thay vì tự fetch */
  externalGrid?: ActualGrid;
  /** Callback để trả grid đã fetch lên parent */
  onGridLoaded?: (grid: ActualGrid, source: string) => void;
}



function getColor(itemId: number, itemColors: Record<string, string>): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  const DEFAULT_COLORS = [
    "#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336",
    "#00BCD4", "#FFEB3B", "#E91E63", "#3F51B5", "#8BC34A",
    "#FF5722", "#607D8B", "#009688", "#795548", "#CDDC39", "#673AB7",
  ];
  const idx = parseInt(String(itemId)) % DEFAULT_COLORS.length;
  return DEFAULT_COLORS[idx];
}
function getBg(itemId: number, itemColors: Record<string, string>): string {
  return getColor(itemId, itemColors) + "33";
}
function getBorder(itemId: number, itemColors: Record<string, string>): string {
  return getColor(itemId, itemColors) + "AA";
}

// Tính kg KH cho máy + ngày từ segments
function getPlanKg(machineId: number, day: number, segments: Segment[], holidays: number[]): number {
  if (holidays.includes(day)) return 0;
  const seg = segments.find(s => s.machineId === machineId && day >= s.fromDay && day <= s.toDay);
  return seg ? seg.kgPerDay : 0;
}

// Màu so sánh TH vs KH
function compareColor(actual: number, plan: number): string {
  if (plan === 0) return "#595959";
  if (actual >= plan) return "#52c41a";
  if (actual >= plan * 0.9) return "#faad14";
  return "#ff4d4f";
}

export default function ActualProductionGrid({
  scheduleId,
  segments,
  holidays,
  totalDays,
  itemColors,
  yearMonth,
  externalGrid,
  onGridLoaded,
}: ActualProductionGridProps) {
  const [internalGrid, setInternalGrid] = useState<ActualGrid>({});
  const [source, setSource] = useState<string>("KD_DAILY_INPUT");
  const [loadedScheduleId, setLoadedScheduleId] = useState<number | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);

  // Dùng externalGrid nếu có, ngược lại dùng internalGrid
  const grid = externalGrid ?? internalGrid;

  // Derive loading: nếu có externalGrid thì không cần loading riêng;
  // nếu tự fetch thì chờ loadedScheduleId khớp
  const loading = !externalGrid && loadedScheduleId !== scheduleId;

  const [schedYear, schedMonth] = yearMonth.split("-").map(Number);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  useEffect(() => {
    // Nếu đã có externalGrid từ parent, không tự fetch nữa
    if (externalGrid !== undefined) return;

    let cancelled = false;

    fetch(`/api/kdsx/production-schedule/${scheduleId}/actual`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const fetchedGrid = data.grid ?? {};
        const fetchedSource = data.source ?? "KD_DAILY_INPUT";
        setInternalGrid(fetchedGrid);
        setSource(fetchedSource);
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

  // Lấy danh sách máy unique từ segments, sắp xếp theo id
  const uniqueMachines = Array.from(
    new Map(segments.map(s => [s.machineId, s.machine])).values()
  ).sort((a, b) => a.id - b.id);

  // Tổng theo ngày (TH)
  const totalActualByDay = dayNumbers.map(day => {
    if (holidays.includes(day)) return 0;
    let total = 0;
    for (const m of uniqueMachines) {
      const cell = grid[m.id]?.[day];
      if (cell) total += cell.kg;
    }
    return total;
  });

  const grandActualTotal = totalActualByDay.reduce((s, v) => s + v, 0);

  const thStyle: React.CSSProperties = {
    background: "#001529", color: "white", padding: "7px 5px",
    textAlign: "center", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 2,
    borderBottom: "2px solid #1d3557",
    borderRight: "1px solid #1d3557",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 5px", textAlign: "center", fontSize: 12, whiteSpace: "nowrap",
    borderRight: "1px solid #9e9e9e",
    borderBottom: "1px solid #bdbdbd",
  };

  return (
    <div>
      {/* Source badge */}
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <Text type="secondary">Nguồn dữ liệu: </Text>
        <Tag color={source === "KD_DAILY_INPUT" ? "blue" : "orange"}>
          {source === "KD_DAILY_INPUT" ? "KD Daily Input" : "Nhật ký SX"}
        </Tag>
        <Text type="secondary" style={{ marginLeft: 8 }}>
          — Màu chữ TH: <span style={{ color: "#52c41a", fontWeight: 600 }}>Xanh ≥ KH</span>,{" "}
          <span style={{ color: "#faad14", fontWeight: 600 }}>Vàng gần đạt</span>,{" "}
          <span style={{ color: "#ff4d4f", fontWeight: 600 }}>Đỏ thấp hơn 10%+</span>
          {" "}— <span style={{ color: "#666", fontWeight: 500 }}>ĐM:<i>x</i> = định mức thực nghiệm theo mặt hàng</span>
          {" "}— <span style={{ color: "#fa8c16", fontWeight: 600 }}>✎ = KH/ngày đã sửa tay (khác ĐM)</span>
        </Text>
      </div>

      <div style={{ overflowX: "auto", border: "2px solid #b0b0b0", borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.1)" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 900, width: "max-content" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, minWidth: 80, position: "sticky", left: 0, zIndex: 3, textAlign: "left", paddingLeft: 8 }}>Máy</th>
              <th style={{ ...thStyle, minWidth: 100, position: "sticky", left: 80, zIndex: 3 }}>Mặt hàng</th>
              {dayNumbers.map(day => {
                const isHoliday = holidays.includes(day);
                return (
                  <th key={day} style={{
                    ...thStyle, minWidth: 38,
                    background: isHoliday ? "#cf1322" : "#001529",
                  }}>
                    {day}
                    <br />
                    <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{schedMonth}/{String(schedYear).slice(2)}</span>
                  </th>
                );
              })}
              <th style={{ ...thStyle, minWidth: 70, background: "#1d3557" }}>TỔNG</th>
            </tr>
          </thead>
          <tbody>
            {uniqueMachines.map((machine, mIdx) => {
              const machineSegs = segments.filter(s => s.machineId === machine.id);
              const machineGrid = grid[machine.id] ?? {};

              // Tổng TH máy này
              let machineTotalActual = 0;
              for (const day of dayNumbers) {
                if (!holidays.includes(day)) {
                  machineTotalActual += machineGrid[day]?.kg ?? 0;
                }
              }

              const isRowSelected = selectedMachineId === machine.id;
              const rowBg = isRowSelected
                ? "#fffbe6"
                : mIdx % 2 === 0 ? "#fff" : "#fafafa";

              return (
                <tr
                  key={machine.id}
                  style={{
                    background: rowBg,
                    cursor: "pointer",
                    outline: isRowSelected ? "2px solid #faad14" : undefined,
                    outlineOffset: isRowSelected ? "-2px" : undefined,
                  }}
                  onClick={() => setSelectedMachineId(prev => prev === machine.id ? null : machine.id)}
                >
                  {/* Máy */}
                  <td style={{
                    ...tdStyle, textAlign: "left", paddingLeft: 8,
                    position: "sticky", left: 0, zIndex: 1,
                    background: rowBg, minWidth: 80,
                    fontWeight: isRowSelected ? 800 : 600,
                    color: isRowSelected ? "#d48806" : undefined,
                  }}>
                    {machine.name}
                    {machine.model && <div style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>{machine.model}</div>}
                  </td>

                  {/* Mặt hàng */}
                  <td style={{
                    ...tdStyle, position: "sticky", left: 80, zIndex: 1,
                    background: rowBg, minWidth: 100,
                  }}>
                    {machineSegs.length > 0
                      ? machineSegs.map(s => (
                        <div key={s.id} style={{ fontSize: 11, color: getColor(s.itemId, itemColors), fontWeight: 600 }}>
                          {s.item.name} ({s.fromDay}–{s.toDay})
                        </div>
                      ))
                      : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
                    }
                  </td>

                  {/* Ô ngày */}
                  {dayNumbers.map(day => {
                    const isHoliday = holidays.includes(day);
                    const cell = machineGrid[day];
                    const planKg = getPlanKg(machine.id, day, segments, holidays);
                    const actualKg = cell?.kg ?? 0;
                    const hasData = !!cell;
                    const itemId = cell?.itemId ?? machineSegs.find(s => day >= s.fromDay && day <= s.toDay)?.itemId;

                    const daySegment = machineSegs.find(s => day >= s.fromDay && day <= s.toDay);
                    // Định mức: lấy từ benchmark.empiricalOutputPerDay (chuẩn theo mặt hàng)
                    const benchmarkKg = daySegment?.benchmark?.empiricalOutputPerDay ?? null;
                    // KH của segment (dùng để so sánh màu TH vs KH)
                    const isDiffFromBenchmark = daySegment && daySegment.isManualKg && benchmarkKg !== null && daySegment.kgPerDay !== benchmarkKg;
                    return (
                      <td key={day} style={{
                        ...tdStyle,
                        background: isHoliday
                          ? "#ffebe8"
                          : hasData && itemId
                            ? getBg(itemId, itemColors)
                            : undefined,
                        borderLeft: "1px solid #d0d0d0",
                      }}
                        title={
                          isHoliday ? "Ngày nghỉ" :
                            !hasData ? "Chưa có dữ liệu thực tế" :
                              `TH: ${actualKg.toLocaleString()} kg` +
                              (planKg > 0 ? ` | KH: ${planKg.toLocaleString()} kg/ngày` : "") +
                              (benchmarkKg !== null ? ` | ĐM: ${benchmarkKg.toLocaleString()} kg/ngày` : "") +
                              (isDiffFromBenchmark ? " (KH đã sửa tay)" : "")
                        }
                      >
                        {isHoliday
                          ? <span style={{ color: "#aaa", fontSize: 11 }}>—</span>
                          : hasData
                            ? <div>
                              <span style={{
                                color: compareColor(actualKg, planKg),
                                fontSize: 11, fontWeight: 800,
                              }}>
                                {actualKg.toLocaleString()}
                              </span>
                              {/* Hiển thị định mức chuẩn (empirical benchmark) */}
                              {benchmarkKg !== null && (
                                <div style={{ fontSize: 9, color: "#666", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
                                  ĐM:{benchmarkKg.toLocaleString()}
                                  {isDiffFromBenchmark && (
                                    <span style={{ color: "#fa8c16", fontSize: 9 }} title="KH đã sửa tay (khác định mức)">✎</span>
                                  )}
                                </div>
                              )}
                            </div>
                            : <span style={{ color: "#bbb", fontSize: 13, lineHeight: 1 }}>·</span>
                        }
                      </td>
                    );
                  })}

                  {/* Tổng kg TH của máy */}
                  <td style={{
                    ...tdStyle,
                    background: "#dbeeff", fontWeight: 800, fontSize: 13,
                    color: "#0050b3", borderLeft: "2px solid #b0b0b0",
                  }}>
                    {machineTotalActual > 0 ? `${machineTotalActual.toLocaleString()} kg` : <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                </tr>
              );
            })}

            {/* Hàng cuối: tổng theo ngày */}
            <tr style={{ background: "#001529" }}>
              <td style={{ ...tdStyle, color: "white", fontWeight: 700, position: "sticky", left: 0, zIndex: 1, background: "#001529", textAlign: "left", paddingLeft: 8 }}>TỔNG TH</td>
              <td style={{ ...tdStyle, color: "white", position: "sticky", left: 80, zIndex: 1, background: "#001529" }}>kg/ngày</td>
              {totalActualByDay.map((kg, i) => {
                const day = i + 1;
                const isHoliday = holidays.includes(day);
                return (
                  <td key={day} style={{
                    ...tdStyle, fontWeight: 600, fontSize: 10,
                    background: isHoliday ? "#434343" : "#1d3557",
                    color: isHoliday ? "#888" : "#52c41a",
                  }}>
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
    </div>
  );
}
