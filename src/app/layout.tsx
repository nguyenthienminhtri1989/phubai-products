// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // File css mặc định nếu có
import { AntdRegistry } from "@ant-design/nextjs-registry";
import AdminLayout from "@/components/AdminLayout"; // Import Layout vào
import { ConfigProvider } from "antd";
import { Providers } from "./providers"; // <--- 1. Import Providers

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Phu Bai Production Manager",
  description: "Phần mềm quản lý sản lượng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <AntdRegistry>
          {/* Cấu hình Theme toàn cục ở đây */}
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#1677ff",
              },
              components: {
                Layout: {
                  siderBg: "#010345", // (1) Màu nền của thanh Sidebar tổng
                },
                Menu: {
                  // Màu nền của các mục menu cấp 1
                  darkItemBg: "#010345",

                  // (2) QUAN TRỌNG: Màu nền của các menu con (SubMenu) khi xổ xuống
                  darkSubMenuItemBg: "#010345", // <-- Bạn chỉnh dòng này trùng màu với siderBg là được

                  // (3) Tùy chọn thêm: Màu nền của mục ĐANG ĐƯỢC CHỌN (Active)
                  // Nên để màu khác một chút (sáng hơn hoặc tối hơn) để người dùng biết mình đang ở đâu
                  darkItemSelectedBg: "#02A7FA",
                },
              },
            }}
          >
            <Providers>
              <AdminLayout>
                {children}
              </AdminLayout>
            </Providers>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
