"use client";

import { Tabs } from "antd";
import HistoryDetailTab from "./components/HistoryDetailTab";
import WindingReportTab from "./components/WindingReportTab";

export default function ProductionHistoryPage() {
    return (
        <div style={{ padding: 20 }}>
            <Tabs
                defaultActiveKey="detail"
                items={[
                    {
                        key: "detail",
                        label: "Lịch sử chi tiết",
                        children: <HistoryDetailTab />,
                    },
                    {
                        key: "report",
                        label: "Báo cáo theo nguồn sợi",
                        children: <WindingReportTab />,
                    },
                ]}
                destroyInactiveTabPane={false}
            />
        </div>
    );
}
