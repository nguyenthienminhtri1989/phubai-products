"use client";

import React, { useEffect, useState } from "react";
import {
  Steps,
  Select,
  Upload,
  Button,
  Alert,
  Spin,
  Result,
  Typography,
  Space,
  message,
} from "antd";
import { InboxOutlined } from "@ant-design/icons";
import MappingStep from "./MappingStep";
import PreviewStep from "./PreviewStep";

const { Dragger } = Upload;
const { Text, Title } = Typography;

interface IotSource {
  id: number;
  name: string;
  isActive: boolean;
}

interface ParsedRow {
  rowIndex: number;
  rawDate: string;
  rawShift: string;
  rawMachine: string;
  rawItem: string | null;
  rawOutput: number;
  mappedDate: string | null;
  mappedShift: number | null;
  mappedMachineId: number | null;
  mappedMachineName: string | null;
  mappedItemId: number | null;
  mappedItemName: string | null;
  finalOutput: number;
  status: "READY" | "NO_MACHINE" | "NO_ITEM" | "NO_SHIFT" | "NO_DATE";
  action: "INSERT" | "UPDATE" | null;
}

interface ParseResult {
  totalRows: number;
  detectedColumns: Record<string, string | null>;
  rows: ParsedRow[];
  unmappedMachines: string[];
  unmappedItems: string[];
  unmappedShifts: string[];
}

interface ImportResult {
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  status: string;
  errorDetails: any[];
}

export default function ImportWizard() {
  const [step, setStep] = useState(0);
  const [sources, setSources] = useState<IotSource[]>([]);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    fetch("/api/iot/sources")
      .then((r) => r.json())
      .then((d) => setSources(d.filter((s: IotSource) => s.isActive)));
  }, []);

  const handleAnalyze = async () => {
    if (!sourceId || !file) {
      message.error("Vui lòng chọn nguồn IoT và file Excel");
      return;
    }
    setParsing(true);
    setParseError(null);
    setParseResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceId", String(sourceId));

      const res = await fetch("/api/iot/parse-excel", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error + (data.detectedHeaders ? `\nHeaders: ${data.detectedHeaders.join(", ")}` : ""));
        return;
      }

      setParseResult(data);

      // Nếu không có unmapped → skip bước mapping
      const hasUnmapped =
        data.unmappedMachines.length > 0 ||
        data.unmappedItems.length > 0 ||
        data.unmappedShifts.length > 0;

      setStep(hasUnmapped ? 1 : 2);
    } catch (err) {
      setParseError("Lỗi kết nối server");
    } finally {
      setParsing(false);
    }
  };

  const handleMappingSaved = async () => {
    // Re-parse sau khi lưu mapping
    if (!sourceId || !file) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceId", String(sourceId));

      const res = await fetch("/api/iot/parse-excel", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        message.error(data.error);
        return;
      }

      setParseResult(data);

      const hasUnmapped =
        data.unmappedMachines.length > 0 ||
        data.unmappedItems.length > 0 ||
        data.unmappedShifts.length > 0;

      if (hasUnmapped) {
        message.warning("Vẫn còn tên chưa được khớp, vui lòng hoàn thành mapping");
      } else {
        setStep(2);
      }
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || !sourceId || !file) return;

    const readyRows = parseResult.rows.filter((r) => r.status === "READY" && r.action !== null);
    if (readyRows.length === 0) {
      message.error("Không có dòng nào sẵn sàng import");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/iot/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          fileName: file.name,
          rows: readyRows.map((r) => ({
            mappedDate: r.mappedDate,
            mappedShift: r.mappedShift,
            mappedMachineId: r.mappedMachineId,
            mappedItemId: r.mappedItemId,
            finalOutput: r.finalOutput,
            action: r.action,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "Lỗi import");
        return;
      }

      setImportResult(data);
      setStep(3);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setFile(null);
    setParseResult(null);
    setParseError(null);
    setImportResult(null);
  };

  const readyCount = parseResult?.rows.filter((r) => r.status === "READY").length ?? 0;

  const stepItems = [
    { title: "Chọn nguồn & Upload" },
    { title: "Khớp tên" },
    { title: "Preview & Xác nhận" },
    { title: "Kết quả" },
  ];

  return (
    <div>
      <Steps current={step} items={stepItems} style={{ marginBottom: 32 }} />

      {/* Bước 1 */}
      {step === 0 && (
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <div>
            <Text strong>Nguồn IoT</Text>
            <Select
              placeholder="Chọn nguồn IoT..."
              style={{ width: "100%", marginTop: 8 }}
              value={sourceId ?? undefined}
              onChange={(v) => setSourceId(v)}
              options={sources.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>

          <div>
            <Text strong>File Excel</Text>
            <Dragger
              style={{ marginTop: 8 }}
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={(f) => {
                if (f.size > 10 * 1024 * 1024) {
                  message.error("File vượt quá 10MB");
                  return Upload.LIST_IGNORE;
                }
                setFile(f);
                return false;
              }}
              onRemove={() => setFile(null)}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Kéo thả hoặc nhấp để chọn file (.xlsx, .xls)</p>
              <p className="ant-upload-hint">Tối đa 10MB</p>
            </Dragger>
          </div>

          {parseError && (
            <Alert
              type="error"
              showIcon
              message="Không thể đọc file"
              description={<pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{parseError}</pre>}
            />
          )}

          <Button
            type="primary"
            size="large"
            loading={parsing}
            disabled={!sourceId || !file}
            onClick={handleAnalyze}
          >
            Phân tích file
          </Button>
        </Space>
      )}

      {/* Bước 2 */}
      {step === 1 && parseResult && (
        <Spin spinning={parsing} tip="Đang cập nhật...">
          <MappingStep
            sourceId={sourceId!}
            parseResult={parseResult}
            onMappingSaved={handleMappingSaved}
          />
        </Spin>
      )}

      {/* Bước 3 */}
      {step === 2 && parseResult && (
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <PreviewStep rows={parseResult.rows} />

          <Button
            type="primary"
            size="large"
            loading={importing}
            disabled={readyCount === 0}
            onClick={handleImport}
          >
            Xác nhận Import ({readyCount} dòng)
          </Button>

          {readyCount === 0 && (
            <Alert type="warning" showIcon message="Không có dòng nào sẵn sàng import" />
          )}
        </Space>
      )}

      {/* Bước 4 */}
      {step === 3 && importResult && (
        <Space direction="vertical" style={{ width: "100%", alignItems: "center" }} size="large">
          <Result
            status={importResult.status === "SUCCESS" ? "success" : importResult.status === "FAILED" ? "error" : "warning"}
            title={
              importResult.status === "SUCCESS"
                ? "Import thành công!"
                : importResult.status === "FAILED"
                ? "Import thất bại"
                : "Import hoàn tất (có lỗi)"
            }
            subTitle={
              `Đã thêm ${importResult.insertedRows} dòng, ` +
              `cập nhật ${importResult.updatedRows} dòng, ` +
              `bỏ qua ${importResult.skippedRows} dòng` +
              (importResult.errorRows > 0 ? `, lỗi ${importResult.errorRows} dòng` : "")
            }
          />

          {importResult.errorDetails?.length > 0 && (
            <div style={{ width: "100%", maxWidth: 600 }}>
              <Title level={5} type="danger">Chi tiết lỗi:</Title>
              <Space direction="vertical" style={{ width: "100%" }}>
                {importResult.errorDetails.map((err: any, idx: number) => (
                  <Alert
                    key={idx}
                    type="error"
                    message={err.reason}
                    description={`Máy: ${err.row?.mappedMachineId} | Ngày: ${err.row?.mappedDate} | Ca: ${err.row?.mappedShift}`}
                  />
                ))}
              </Space>
            </div>
          )}

          <Space>
            <Button type="primary" onClick={handleReset}>
              Import file khác
            </Button>
          </Space>
        </Space>
      )}
    </div>
  );
}
