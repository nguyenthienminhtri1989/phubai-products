import { Metadata, Viewport } from "next";

export const metadata: Metadata = {
    title: "Báo cáo sản lượng | Phú Bài ERP",
    description: "Xem báo cáo sản lượng trên điện thoại",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#1677ff",
};

export default function MobileReportLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#f0f2f5" }}>
            {children}
        </div>
    );
}
