// === FILE: src/app/production/mobile-input/layout.tsx ===
// Layout rieng cho trang mobile: KHONG hien sidebar, khong header desktop

import { Metadata, Viewport } from "next";

export const metadata: Metadata = {
    title: "Nhập sản lượng | Phu Bai ERP",
    description: "Nhập sản lượng trên điện thoại",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#1677ff",
};

export default function MobileInputLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div style={{
            maxWidth: 480,
            margin: "0 auto",
            minHeight: "100vh",
            background: "#f0f2f5",
        }}>
            {children}
        </div>
    );
}
