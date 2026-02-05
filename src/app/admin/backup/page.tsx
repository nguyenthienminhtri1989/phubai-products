"use client";

import React, { useState } from "react";
import { Card, Button, Upload, message, Modal, Alert, Typography, Divider, Steps } from "antd";
import { CloudDownloadOutlined, CloudUploadOutlined, InboxOutlined, WarningOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";

const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function BackupPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);

    // --- XỬ LÝ BACKUP (TẢI VỀ) ---
    const handleBackup = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/backup");
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            // Tạo file JSON ảo để tải về
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            // Đặt tên file theo ngày giờ: backup-2026-02-05.json
            a.download = `backup-phubai-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            window.URL.revokeObjectURL(url);

            message.success("Đã tải xuống file Backup thành công!");
        } catch (error) {
            console.error(error);
            message.error("Lỗi khi tạo backup");
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
                        setLoading(true);
                        try {
                            const res = await fetch("/api/admin/backup", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(jsonContent),
                            });

                            if (!res.ok) throw new Error("Lỗi server");

                            message.success("Khôi phục dữ liệu thành công!");
                            // Tùy chọn: Reload trang
                            window.location.reload();
                        } catch (err) {
                            console.error(err);
                            message.error("File lỗi hoặc cấu trúc không hợp lệ");
                        } finally {
                            setLoading(false);
                        }
                    }
                });

            } catch (err) {
                console.error(err);
                message.error("File không đúng định dạng JSON");
            }
        };
        reader.readAsText(file);
        return false; // Chặn upload mặc định của Antd
    };

    if (session?.user?.role !== "ADMIN") return <div className="p-10 text-center">Bạn không có quyền truy cập trang này</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
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
                    <p>Tải xuống toàn bộ dữ liệu hiện tại (Máy móc, Mặt hàng, Nhật ký sản xuất, Tài khoản...) dưới dạng file <b>.json</b>.</p>
                    <p className="text-gray-500 text-sm mb-4">Dùng file này để lưu trữ dự phòng hoặc chuyển dữ liệu sang máy khác.</p>

                    <Button
                        type="primary"
                        size="large"
                        icon={<CloudDownloadOutlined />}
                        onClick={handleBackup}
                        loading={loading}
                        block
                    >
                        Tải xuống File Backup
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
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Kéo thả file JSON vào đây</p>
                        <p className="ant-upload-hint">
                            Hoặc bấm để chọn file từ máy tính
                        </p>
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
                        { title: 'Bấm Tải xuống Backup' },
                        { title: 'Thực hiện cập nhật Code/DB' },
                        { title: 'Nếu mất dữ liệu -> Upload file để Restore' },
                    ]}
                />
            </div>
        </div>
    );
}