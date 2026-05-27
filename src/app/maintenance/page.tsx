"use client";
import { useEffect } from "react";

export default function MaintenancePage() {
  // Tự động reload mỗi 10 giây để kiểm tra xem deploy xong chưa
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/maintenance");
        const { active } = await res.json();
        if (!active) window.location.href = "/";
      } catch {}
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#f0f4f8",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "48px",
          borderRadius: "16px",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          maxWidth: "420px",
        }}
      >
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>⚙️</div>
        <h2 style={{ color: "#1a1a2e", marginBottom: "12px" }}>
          Đang cập nhật tính năng mới
        </h2>
        <p style={{ color: "#666", lineHeight: 1.6 }}>
          Hệ thống đang được nâng cấp. Vui lòng chờ giây lát, trang sẽ tự động
          tiếp tục khi hoàn tất.
        </p>
        <div style={{ marginTop: "24px", color: "#999", fontSize: "13px" }}>
          🔄 Đang kiểm tra trạng thái...
        </div>
      </div>
    </div>
  );
}
