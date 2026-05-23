"use client";

import { useState, useEffect } from "react";
import { message } from "antd";
import type { Factory, Process, ItemOption, LotOption } from "@/types/production";

export function useProductionMetadata() {
  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [lots, setLots] = useState<LotOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/factories").then(r => r.json()),
      fetch("/api/processes").then(r => r.json()),
      fetch("/api/items").then(r => r.json()),
      fetch("/api/lots").then(r => r.json()),
    ])
      .then(([facs, procs, its, lts]) => {
        setFactories(Array.isArray(facs) ? facs : []);
        setProcesses(Array.isArray(procs) ? procs : []);
        setItems(Array.isArray(its) ? its : []);
        setLots(Array.isArray(lts) ? lts : []);
      })
      .catch(() => message.error("Lỗi tải danh mục"))
      .finally(() => setLoading(false));
  }, []);

  const refreshLots = async () => {
    try {
      const res = await fetch("/api/lots");
      if (res.ok) setLots(await res.json());
    } catch { /* ignore */ }
  };

  return { factories, processes, items, lots, loading, refreshLots };
}
