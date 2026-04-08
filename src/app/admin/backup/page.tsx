"use client";

import React, { useState } from "react";
import { Card, Button, Upload, message, Modal, Alert, Typography, Divider, Steps } from "antd";
import { CloudDownloadOutlined, CloudUploadOutlined, InboxOutlined, WarningOutlined, DatabaseOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";
import { Color } from "antd/es/color-picker";

const { Title } = Typography;
const { Dragger } = Upload;

export default function BackupPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);

    // Sử dụng messageApi để quản lý trạng thái loading tốt hơn
    const [messageApi, contextHolder] = message.useMessage();

    // --- XỬ LÝ BACKUP VỚI FILE SQL ---
    const handleBackupSql = async () => {
        messageApi.open({ type: "loading", content: "Đang tạo file SQL (PostgreSQL Dump)...", duration: 0 });
        setLoading(true);

        try {
            const res = await fetch("/api/admin/backup-sql");
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Lỗi Server");
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = `backup-phubai-${dateStr}.sql`;
            a.click();
            window.URL.revokeObjectURL(url);

            messageApi.destroy();
            messageApi.success("Đã tải xuống file SQL thành công!");
        } catch (error: any) {
            console.error(error);
            messageApi.destroy();
            messageApi.error(error.message || "Lỗi khi tạo backup SQL");
        } finally {
            setLoading(false);
        }
    };

    // --- XỬ LÝ RESTORE VỚI FILE SQL ---
    const handleRestoreSql = (file: File) => {
        Modal.confirm({
            title: "CẢNH BÁO QUAN TRỌNG (Khôi phục từ SQL)",
            icon: <WarningOutlined style={{ color: "red" }} />,
            content: (
                <div>
                    <p>Hành động này sẽ thực thi script SQL để thay thế toàn bộ Database hiện tại.</p>
                    <p>Cực kỳ nguy hiểm nếu file không đúng chuẩn của hệ thống này. Bạn chắc chắn muốn tiếp tục?</p>
                </div>
            ),
            okText: "Tiến hành Khôi phục",
            okType: "danger",
            cancelText: "Hủy",
            onOk: async () => {
                messageApi.open({ type: "loading", content: "Đang khôi phục dữ liệu từ file SQL...", duration: 0 });
                setLoading(true);
                try {
                    const res = await fetch("/api/admin/backup-sql", {
                        method: "POST",
                        body: file,
                    });

                    const result = await res.json();
                    if (!res.ok) throw new Error(result.error || "Lỗi server khi chạy lệnh SQL");

                    messageApi.destroy();
                    messageApi.success("Khôi phục DB từ file SQL thành công!");
                    setTimeout(() => window.location.reload(), 1500);
                } catch (err: any) {
                    console.error(err);
                    messageApi.destroy();
                    messageApi.error(err.message || "File bị lỗi hoặc script SQL không hợp lệ");
                } finally {
                    setLoading(false);
                }
            },
        });
        return false; // Ngăn chặn tự động upload 
    };

    // --- XỬ LÝ BACKUP (TẢI VỀ JSON) ---
    const handleBackup = async () => {
        messageApi.open({ type: "loading", content: "Đang chuẩn bị gói dữ liệu (tất cả bảng)...", duration: 0 });
        setLoading(true);

        try {
            const res = await fetch("/api/admin/backup");
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Lỗi Server");

            // Tạo file JSON ảo để tải về
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;

            // Đặt tên file theo ngày giờ cho dễ quản lý
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = `backup-phubai-${dateStr}.json`;
            a.click();
            window.URL.revokeObjectURL(url);

            messageApi.destroy();
            messageApi.success("Đã tải xuống file Backup thành công!");
        } catch (error: any) {
            console.error(error);
            messageApi.destroy();
            messageApi.error(error.message || "Lỗi khi tạo backup");
        } finally {
            setLoading(false);
        }
    };

    // --- XỬ LÝ RESTORE (UPLOAD) ---
    const handleRestore = (file: File) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonContent = JSON.parse(e.target?.result as string);

                Modal.confirm({
                    title: "CẢNH BÁO QUAN TRỌNG",
                    icon: <WarningOutlined style={{ color: "red" }} />,
                    content: (
                        <div>
                            <p>Hành động này sẽ <b>XÓA TOÀN BỘ DỮ LIỆU HIỆN TẠI</b> và thay thế bằng dữ liệu trong file backup.</p>
                            <p>Bạn có chắc chắn muốn tiếp tục không?</p>
                        </div>
                    ),
                    okText: "Tôi đồng ý Khôi phục",
                    okType: "danger",
                    cancelText: "Hủy",
                    onOk: async () => {
                        messageApi.open({ type: "loading", content: "Đang xóa dữ liệu cũ và khôi phục dữ liệu mới...", duration: 0 });
                        setLoading(true);
                        try {
                            const res = await fetch("/api/admin/backup", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(jsonContent),
                            });

                            const result = await res.json();
                            if (!res.ok) throw new Error(result.error || "Lỗi server khi khôi phục");

                            messageApi.destroy();
                            messageApi.success("Khôi phục dữ liệu thành công!");

                            // Reload trang sau 1.5s để cập nhật lại dữ liệu hiển thị
                            setTimeout(() => {
                                window.location.reload();
                            }, 1500);
                        } catch (err: any) {
                            console.error(err);
                            messageApi.destroy();
                            messageApi.error(err.message || "File lỗi hoặc cấu trúc không hợp lệ");
                        } finally {
                            setLoading(false);
                        }
                    },
                });
            } catch (err) {
                console.error(err);
                message.error("File không đúng định dạng JSON");
            }
        };
        reader.readAsText(file);

        // Trả về false để chặn hành vi tự động gọi API upload mặc định của thư viện Ant Design
        return false;
    };

    if (session?.user?.role !== "ADMIN") {
        return <div className="p-10 text-center">Bạn không có quyền truy cập trang này</div>;
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {contextHolder}
            <Title level={2}>Sao lưu & Phục hồi Dữ liệu</Title>
            <Alert
                message="Vùng nguy hiểm"
                description="Chức năng này can thiệp trực tiếp vào Database. Hãy cẩn thận khi thực hiện Phục hồi (Restore)."
                type="warning"
                showIcon
                style={{ marginBottom: 24 }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* CỘT BACKUP */}
                <Card
                    title={<><CloudDownloadOutlined /> Sao lưu (Export)</>}
                    bordered={false}
                    style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                >
                    <p>Tải xuống toàn bộ dữ liệu hiện tại dưới dạng file <b>.json</b>, bao gồm:</p>
                    <ul className="text-gray-600 text-sm list-disc list-inside mb-2 space-y-0.5">
                        <li>Nhà máy, Công đoạn, Máy móc, Mặt hàng</li>
                        <li>Tài khoản, Phân quyền công đoạn</li>
                        <li>Nhật ký sản xuất, Sơ đồ line, Dừng máy</li>
                        <li><b>Đồng hồ điện, Trạm biến áp, Chỉ số điện hàng ngày</b></li>
                        <li>Giá điện, Nhóm đồng hồ, Telemetry IoT</li>
                        <li>Bảo dưỡng, Ca làm việc, Nguồn IoT</li>
                    </ul>
                    <p className="text-gray-500 text-sm mb-4">Dùng file này để lưu trữ dự phòng hoặc chuyển dữ liệu sang máy khác.</p>

                    <Button
                        type="primary"
                        size="large"
                        icon={<CloudDownloadOutlined />}
                        onClick={handleBackup}
                        loading={loading}
                        block
                        style={{ marginBottom: 12 }}
                    >
                        Tải xuống File JSON
                    </Button>

                    <Button
                        type="primary" danger
                        size="large"
                        icon={<DatabaseOutlined />}
                        onClick={handleBackupSql}
                        loading={loading}
                        block
                    >
                        Tải xuống Cơ sở dữ liệu .sql
                    </Button>
                </Card>

                {/* CỘT RESTORE */}
                <Card
                    title={<><CloudUploadOutlined /> Phục hồi (Import)</>}
                    bordered={false}
                    style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                >
                    <p>Khôi phục dữ liệu từ file <b>.json</b> đã backup trước đó.</p>
                    <p className="text-red-500 text-sm mb-4 font-bold">Lưu ý: Dữ liệu hiện tại sẽ bị ghi đè hoàn toàn.</p>

                    <Dragger
                        name="file"
                        multiple={false}
                        showUploadList={false}
                        beforeUpload={handleRestore}
                        disabled={loading}
                        accept=".json"
                        style={{ marginBottom: 12, backgroundColor: "#7cc2f1ff" }}
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Khôi phục từ file .json</p>
                        <p className="ant-upload-hint">Kéo thả hoặc nhấn chọn file .json</p>
                    </Dragger>

                    <Dragger
                        name="sqlFile"
                        multiple={false}
                        showUploadList={false}
                        beforeUpload={handleRestoreSql}
                        disabled={loading}
                        accept=".sql"
                        style={{ backgroundColor: "#f5888eff" }}
                    >
                        <p className="ant-upload-drag-icon">
                            <DatabaseOutlined />
                        </p>
                        <p className="ant-upload-text">Khôi phục từ file .sql</p>
                        <p className="ant-upload-hint">Kéo thả hoặc upload file .sql</p>
                    </Dragger>
                </Card>
            </div>

            <Divider />

            <div className="text-gray-500 text-sm">
                <b>Quy trình khuyến nghị khi cập nhật phần mềm:</b>
                <Steps
                    size="small"
                    current={-1}
                    style={{ marginTop: 10 }}
                    items={[
                        { title: "Bấm Tải xuống Backup" },
                        { title: "Thực hiện cập nhật Code/DB" },
                        { title: "Nếu mất dữ liệu -> Upload file để Restore" },
                    ]}
                />
            </div>
        </div>
    );
}