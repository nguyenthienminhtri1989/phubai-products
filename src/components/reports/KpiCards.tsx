"use client";

import React from "react";
import { Card, Col, Row, Statistic } from "antd";
import { BarChartOutlined, CalendarOutlined, RiseOutlined, TableOutlined } from "@ant-design/icons";

interface KpiCardsProps {
  grandTotal: number;
  todayTotal: number;
  avgPerDay: number;
  daysWithData: number;
  loading: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function KpiCards({ grandTotal, todayTotal, avgPerDay, daysWithData, loading }: KpiCardsProps) {
  const cards = [
    {
      title: "Tổng sản lượng kỳ này",
      value: fmt(grandTotal),
      suffix: "kg",
      icon: <BarChartOutlined style={{ color: "#1677ff", fontSize: 24 }} />,
      color: "#e6f4ff",
      border: "#91caff",
    },
    {
      title: "Sản lượng hôm nay",
      value: fmt(todayTotal),
      suffix: "kg",
      icon: <CalendarOutlined style={{ color: "#52c41a", fontSize: 24 }} />,
      color: "#f6ffed",
      border: "#b7eb8f",
    },
    {
      title: "Trung bình / ngày",
      value: fmt(avgPerDay),
      suffix: "kg",
      icon: <RiseOutlined style={{ color: "#fa8c16", fontSize: 24 }} />,
      color: "#fff7e6",
      border: "#ffd591",
    },
    {
      title: "Số ngày có dữ liệu",
      value: daysWithData.toString(),
      suffix: "ngày",
      icon: <TableOutlined style={{ color: "#722ed1", fontSize: 24 }} />,
      color: "#f9f0ff",
      border: "#d3adf7",
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col xs={24} sm={12} lg={6} key={card.title}>
          <Card
            loading={loading}
            style={{ borderColor: card.border, background: card.color }}
            styles={{ body: { padding: "16px 20px" } }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>{card.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{card.title}</div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
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
