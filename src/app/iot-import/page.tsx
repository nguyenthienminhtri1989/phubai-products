"use client";

import React, { useState } from "react";
import { Tabs, Typography, Button, Space } from "antd";
import { UploadOutlined, HistoryOutlined, SettingOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import ImportWizard from "@/components/iot-import/ImportWizard";
import ImportHistory from "@/components/iot-import/ImportHistory";

const { Title } = Typography;

export default function IotImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("import");

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Title level={3} style={{ margin: 0 }}>
          <UploadOutlined style={{ marginRight: 8 }} />
          Import IoT Excel
        </Title>
        <Button
          icon={<SettingOutlined />}
          onClick={() => router.push("/iot-import/sources")}
        >
          Quản lý nguồn IoT
        </Button>
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "import",
            label: (
              <span>
                <UploadOutlined />
                Import file
              </span>
            ),
            children: <ImportWizard />,
          },
          {
            key: "history",
            label: (
              <span>
                <HistoryOutlined />
                Lịch sử import
              </span>
            ),
            children: <ImportHistory />,
          },
        ]}
      />
    </div>
  );
}
