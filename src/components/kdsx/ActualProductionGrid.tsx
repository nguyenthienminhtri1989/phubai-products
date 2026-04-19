"use client";

import React, { useState, useEffect } from "react";
import { Spin, Typography, Tag } from "antd";

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
}

interface ActualGrid {
  [machineId: number]: {
    [day: number]: { itemId: number; kg: number };
  };
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
}: ActualProductionGridProps) {
  const [grid, setGrid] = useState<ActualGrid>({});
  const [source, setSource] = useState<string>("KD_DAILY_INPUT");
  const [loadedScheduleId, setLoadedScheduleId] = useState<number | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);

  // Derive loading: chưa load xong khi loadedScheduleId chưa khớp với scheduleId hiện tại
  const loading = loadedScheduleId !== scheduleId;

  const [schedYear, schedMonth] = yearMonth.split("-").map(Number);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/kdsx/production-schedule/${scheduleId}/actual`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setGrid(data.grid ?? {});
        setSource(data.source ?? "KD_DAILY_INPUT");
        setLoadedScheduleId(scheduleId);
      })
      .catch(() => {
        if (cancelled) return;
        setGrid({});
        setLoadedScheduleId(scheduleId);
      });

    return () => { cancelled = true; };
  }, [scheduleId]);

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
    background: "#0a2540", color: "white", padding: "7px 5px",
    textAlign: "center", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 2,
    borderBottom: "2px solid #1d3557",
    borderRight: "1px solid #1d3557",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 5px", textAlign: "center", fontSize: 12, whiteSpace: "nowrap",
    borderRight: "1px solid #d0d0d0",
    borderBottom: "1px solid #e8e8e8",
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
          — Màu ô: <span style={{ color: "#52c41a", fontWeight: 600 }}>Xanh ≥ KH</span>,{" "}
          <span style={{ color: "#faad14", fontWeight: 600 }}>Vàng gần đạt</span>,{" "}
          <span style={{ color: "#ff4d4f", fontWeight: 600 }}>Đỏ thấp hơn 10%+</span>
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
                    background: isHoliday ? "#cf1322" : "#0a2540",
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

                    return (
                      <td key={day} style={{
                        ...tdStyle,
                        background: isHoliday
                          ? "#ffebe8"
                          : hasData && itemId
                            ? getBg(itemId, itemColors)
                            : undefined,
                        borderLeft: "1px solid #d0d0d0",
                      }}>
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
                              {planKg > 0 && (
                                <div style={{ fontSize: 9, color: "#666", fontWeight: 500 }}>
                                  ({planKg.toLocaleString()})
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
            <tr style={{ background: "#0a2540" }}>
              <td style={{ ...tdStyle, color: "white", fontWeight: 700, position: "sticky", left: 0, zIndex: 1, background: "#0a2540", textAlign: "left", paddingLeft: 8 }}>TỔNG TH</td>
              <td style={{ ...tdStyle, color: "white", position: "sticky", left: 80, zIndex: 1, background: "#0a2540" }}>kg/ngày</td>
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
