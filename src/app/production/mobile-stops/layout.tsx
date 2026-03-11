import { Metadata, Viewport } from "next";

export const metadata: Metadata = {
    title: "Ghi nhận dừng máy | Phu Bai ERP",
    description: "Báo dừng và xác nhận chạy lại máy trên điện thoại",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#ff4d4f",
};

export default function MobileStopsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#f0f2f5" }}>
            {children}
        </div>
    );
}
