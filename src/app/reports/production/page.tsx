"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Alert, Divider, Spin, Typography } from "antd";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";

import FilterBar, { FilterValues } from "@/components/reports/FilterBar";
import KpiCards from "@/components/reports/KpiCards";
import OutputByDate from "@/components/reports/OutputByDate";
import OutputByShift from "@/components/reports/OutputByShift";
import OutputByMachine from "@/components/reports/OutputByMachine";
import OutputByItem from "@/components/reports/OutputByItem";

const { Title } = Typography;

interface ReportData {
  byDate: Array<{ date: string; total: number; shift1: number; shift2: number; shift3: number }>;
  byMachine: Array<{ machineId: number; machineName: string; processName: string; total: number }>;
  byItem: Array<{ itemId: number; itemName: string; itemCode: string | null; total: number }>;
  summary: {
    grandTotal: number;
    todayTotal: number;
    avgPerDay: number;
    daysWithData: number;
  };
}

const EMPTY_DATA: ReportData = {
  byDate: [],
  byMachine: [],
  byItem: [],
  summary: { grandTotal: 0, todayTotal: 0, avgPerDay: 0, daysWithData: 0 },
};

export default function ProductionReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData>(EMPTY_DATA);
  const [error, setError] = useState<string | null>(null);
  const [selectedMachineIds, setSelectedMachineIds] = useState<number[]>([]);

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN" && role !== "MANAGER") {
        router.push("/");
      }
    }
  }, [status, session, router]);

  const fetchData = useCallback(async (filters: FilterValues) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("startDate", filters.dateRange[0].format("YYYY-MM-DD"));
      params.set("endDate", filters.dateRange[1].format("YYYY-MM-DD"));
      if (filters.factoryId) params.set("factoryId", String(filters.factoryId));
      if (filters.processId) params.set("processId", String(filters.processId));
      if (filters.machineIds.length > 0) params.set("machineIds", filters.machineIds.join(","));
      if (filters.itemIds.length > 0) params.set("itemIds", filters.itemIds.join(","));
      if (filters.shifts.length > 0 && filters.shifts.length < 3) {
        params.set("shifts", filters.shifts.join(","));
      }

      const res = await fetch(`/api/reports/production?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Lỗi không xác định");
      setData(json);
      // Reset machine selection on new query
      setSelectedMachineIds(filters.machineIds);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch with default filters on mount
  useEffect(() => {
    if (status === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role === "ADMIN" || role === "MANAGER") {
        fetchData({
          dateRange: [dayjs().subtract(29, "day"), dayjs()],
          factoryId: null,
          processId: null,
          machineIds: [],
          itemIds: [],
          shifts: [1, 2, 3],
        });
      }
    }
  }, [status, session, fetchData]);

  const handleMachineClick = useCallback((machineId: number) => {
    setSelectedMachineIds((prev) =>
      prev.includes(machineId)
        ? prev.filter((id) => id !== machineId)
        : [...prev, machineId].slice(0, 5)
    );
  }, []);

  if (status === "loading") {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        Báo cáo Sản lượng
      </Title>

      {/* Bộ lọc */}
      <FilterBar onApply={fetchData} loading={loading} />

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />
      )}

      <Spin spinning={loading} tip="Đang tải dữ liệu...">
        {/* A — Tổng quan */}
        <KpiCards
          grandTotal={data.summary.grandTotal}
          todayTotal={data.summary.todayTotal}
          avgPerDay={data.summary.avgPerDay}
          daysWithData={data.summary.daysWithData}
          loading={loading}
        />

        <Divider orientation={"left" as any} style={{ marginTop: 24 }}>
          Sản lượng theo ngày
        </Divider>
        <OutputByDate data={data.byDate} loading={loading} />

        <Divider orientation={"left" as any} style={{ marginTop: 24 }}>
          Phân tích theo ca
        </Divider>
        <OutputByShift data={data.byDate} loading={loading} />

        <Divider orientation={"left" as any} style={{ marginTop: 24 }}>
          Phân tích theo máy
        </Divider>
        <OutputByMachine
          byMachine={data.byMachine}
          byDate={data.byDate}
          selectedMachineIds={selectedMachineIds}
          loading={loading}
          onMachineClick={handleMachineClick}
        />

        <Divider orientation={"left" as any} style={{ marginTop: 24 }}>
          Phân tích theo mặt hàng
        </Divider>
        <OutputByItem byItem={data.byItem} byDate={data.byDate} loading={loading} />
      </Spin>
    </div>
  );
}
