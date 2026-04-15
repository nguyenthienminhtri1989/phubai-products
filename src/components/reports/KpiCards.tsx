"use client";

import React from "react";
import { Card, Col, Row, Statistic } from "antd";
import { BarChartOutlined, CalendarOutlined, DashboardOutlined, RiseOutlined, TableOutlined } from "@ant-design/icons";

interface KpiCardsProps {
  grandTotal: number;
  todayTotal: number;
  avgPerDay: number;
  daysWithData: number;
  avgEfficiency?: number | null;
  loading: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function KpiCards({ grandTotal, todayTotal, avgPerDay, daysWithData, avgEfficiency, loading }: KpiCardsProps) {
  // Màu hiệu suất: xanh ≥95%, cam ≥85%, đỏ <85%
  const effColor = avgEfficiency == null ? "#8c8c8c" : avgEfficiency >= 95 ? "#52c41a" : avgEfficiency >= 85 ? "#fa8c16" : "#f5222d";

  const cards = [
    {
      title: "Tổng sản lượng kỳ này",
      value: fmt(grandTotal),
      suffix: "kg",
      icon: <BarChartOutlined style={{ color: "#1677ff", fontSize: 24 }} />,
      color: "#e6f4ff",
      border: "#91caff",
      valueColor: undefined,
    },
    {
      title: "Sản lượng hôm nay",
      value: fmt(todayTotal),
      suffix: "kg",
      icon: <CalendarOutlined style={{ color: "#52c41a", fontSize: 24 }} />,
      color: "#f6ffed",
      border: "#b7eb8f",
      valueColor: undefined,
    },
    {
      title: "Trung bình / ngày",
      value: fmt(avgPerDay),
      suffix: "kg",
      icon: <RiseOutlined style={{ color: "#fa8c16", fontSize: 24 }} />,
      color: "#fff7e6",
      border: "#ffd591",
      valueColor: undefined,
    },
    {
      title: "Số ngày có dữ liệu",
      value: daysWithData.toString(),
      suffix: "ngày",
      icon: <TableOutlined style={{ color: "#722ed1", fontSize: 24 }} />,
      color: "#f9f0ff",
      border: "#d3adf7",
      valueColor: undefined,
    },
    {
      title: "Hiệu suất TB (cả kỳ)",
      value: avgEfficiency != null ? avgEfficiency.toFixed(1) : "—",
      suffix: avgEfficiency != null ? "%" : "",
      icon: <DashboardOutlined style={{ color: effColor, fontSize: 24 }} />,
      color: "#fff1f0",
      border: "#ffa39e",
      valueColor: effColor,
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col xs={24} sm={12} lg={Math.floor(24 / cards.length) as any} key={card.title}>
          <Card
            loading={loading}
            style={{ borderColor: card.border, background: card.color }}
            styles={{ body: { padding: "16px 20px" } }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>{card.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{card.title}</div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: card.valueColor }}>
                  {card.value}
                  <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4, color: "#888" }}>
                    {card.suffix}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
