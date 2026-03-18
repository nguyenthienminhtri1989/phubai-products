"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Form, Input, Button, Tabs, Select, message } from "antd";
import {
  UserOutlined,
  LockOutlined,
  IdcardOutlined,
  LoginOutlined,
  UserAddOutlined,
  ApartmentOutlined,
} from "@ant-design/icons";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [processes, setProcesses] = useState([]);

  useEffect(() => {
    fetch("/api/processes")
      .then((res) => res.json())
      .then(setProcesses);
  }, []);

  const handleLogin = async (values: any) => {
    setLoading(true);
    const res = await signIn("credentials", {
      redirect: false,
      username: values.username,
      password: values.password,
    });
    setLoading(false);

    if (res?.error) {
      message.error(res.error);
    } else {
      message.success("Đăng nhập thành công!");
      router.push("/");
    }
  };

  const handleRegister = async (values: any) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      message.success(data.message);
      setActiveTab("login");
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        .login-root {
          font-family: 'Inter', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #0e4d7a 70%, #064e3b 100%);
          position: relative;
          overflow: hidden;
          padding: 20px;
        }

        /* Animated orbs */
        .login-root::before,
        .login-root::after {
          content: '';
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.25;
          animation: floatOrb 8s ease-in-out infinite alternate;
        }
        .login-root::before {
          width: 500px; height: 500px;
          background: radial-gradient(circle, #3b82f6, transparent);
          top: -100px; left: -100px;
        }
        .login-root::after {
          width: 400px; height: 400px;
          background: radial-gradient(circle, #10b981, transparent);
          bottom: -80px; right: -80px;
          animation-delay: -4s;
        }

        @keyframes floatOrb {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(40px, 30px) scale(1.08); }
        }

        /* Card */
        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 440px;
          background: rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          padding: 40px 36px 36px;
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset;
          animation: slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Logo / Branding */
        .login-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
        }
        .login-logo-icon {
          width: 64px; height: 64px;
          background: linear-gradient(135deg, #3b82f6, #06b6d4);
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          font-size: 28px;
          box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
        }
        .login-title {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.5px;
          margin: 0;
        }
        .login-subtitle {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          margin: 0;
          font-weight: 400;
        }

        /* Tabs */
        .login-tabs .ant-tabs-nav {
          margin-bottom: 24px !important;
        }
        .login-tabs .ant-tabs-nav::before {
          border-bottom-color: rgba(255,255,255,0.1) !important;
        }
        .login-tabs .ant-tabs-tab {
          color: rgba(255,255,255,0.5) !important;
          font-weight: 500;
          font-size: 14px;
          padding: 8px 0 !important;
          transition: color 0.2s;
        }
        .login-tabs .ant-tabs-tab:hover {
          color: rgba(255,255,255,0.85) !important;
        }
        .login-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
          color: #60a5fa !important;
          font-weight: 600;
        }
        .login-tabs .ant-tabs-ink-bar {
          background: linear-gradient(90deg, #3b82f6, #06b6d4) !important;
          height: 3px !important;
          border-radius: 2px !important;
        }

        /* Form labels & inputs */
        .login-card .ant-form-item-label > label {
          color: rgba(255,255,255,0.75) !important;
          font-weight: 500;
        }
        .login-card .ant-input-affix-wrapper,
        .login-card .ant-select-selector {
          background: rgba(255,255,255,0.08) !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
          border-radius: 10px !important;
          color: #ffffff !important;
          transition: border-color 0.2s, box-shadow 0.2s !important;
        }
        .login-card .ant-input-affix-wrapper:hover,
        .login-card .ant-select-selector:hover {
          border-color: rgba(96, 165, 250, 0.6) !important;
        }
        .login-card .ant-input-affix-wrapper-focused,
        .login-card .ant-select-focused .ant-select-selector {
          border-color: #60a5fa !important;
          box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15) !important;
        }
        .login-card .ant-input {
          background: transparent !important;
          color: #ffffff !important;
          border: none !important;
        }
        .login-card .ant-input:-webkit-autofill,
        .login-card .ant-input:-webkit-autofill:hover, 
        .login-card .ant-input:-webkit-autofill:focus, 
        .login-card .ant-input:-webkit-autofill:active {
          -webkit-text-fill-color: #ffffff !important;
          transition: background-color 5000s ease-in-out 0s !important;
        }
        .login-card .ant-input::placeholder,
        .login-card .ant-input-password input::placeholder {
          color: rgba(255,255,255,0.3) !important;
        }
        .login-card .ant-input-prefix {
          color: rgba(255,255,255,0.4) !important;
          margin-right: 8px !important;
        }
        .login-card .ant-input-password-icon {
          color: rgba(255,255,255,0.4) !important;
        }
        .login-card .ant-select-selection-placeholder {
          color: rgba(255,255,255,0.3) !important;
        }
        .login-card .ant-select-selection-item {
          color: #ffffff !important;
        }
        .login-card .ant-select-arrow {
          color: rgba(255,255,255,0.4) !important;
        }
        .login-card .ant-form-item-explain-error {
          color: #f87171 !important;
          font-size: 12px;
        }

        /* Submit button */
        .login-btn {
          width: 100%;
          height: 48px !important;
          border-radius: 12px !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          letter-spacing: 0.5px;
          border: none !important;
          background: linear-gradient(135deg, #3b82f6, #06b6d4) !important;
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4) !important;
          transition: transform 0.15s, box-shadow 0.15s !important;
          margin-top: 6px;
        }
        .login-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 10px 28px rgba(59, 130, 246, 0.5) !important;
          color: #ff4444 !important;
        }
        .login-btn:hover span {
          color: #ff4444 !important;
        }
        .login-btn:active {
          transform: translateY(0) !important;
        }

        /* Notice */
        .login-notice {
          margin-top: 14px;
          background: rgba(250, 204, 21, 0.08);
          border: 1px solid rgba(250, 204, 21, 0.2);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 12px;
          color: rgba(253, 224, 71, 0.85);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .login-notice-icon {
          font-size: 14px;
          flex-shrink: 0;
        }

        /* Footer */
        .login-footer {
          margin-top: 24px;
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.25);
        }
      `}</style>

      <div className="login-root">
        <div className="login-card">
          {/* Branding */}
          <div className="login-logo">
            <Image
              src="/LogoSPB.png"
              alt="Phu Bai Production Logo"
              width={80}
              height={80}
              style={{ objectFit: "contain", filter: "drop-shadow(0 4px 16px rgba(59,130,246,0.4))" }}
              priority
            />
            <p className="login-title">PHU BAI PRODUCTION</p>
            <p className="login-subtitle">Hệ thống quản lý sản xuất</p>
          </div>

          {/* Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            className="login-tabs"
            items={[
              {
                key: "login",
                label: (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <LoginOutlined /> Đăng nhập
                  </span>
                ),
                children: (
                  <Form onFinish={handleLogin} layout="vertical" size="large">
                    <Form.Item
                      name="username"
                      rules={[{ required: true, message: "Vui lòng nhập tên đăng nhập" }]}
                    >
                      <Input
                        prefix={<UserOutlined />}
                        placeholder="Tên đăng nhập"
                      />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: "Vui lòng nhập mật khẩu" }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="Mật khẩu"
                      />
                    </Form.Item>
                    <Button
                      htmlType="submit"
                      loading={loading}
                      className="login-btn"
                    >
                      ĐĂNG NHẬP
                    </Button>
                  </Form>
                ),
              },
              {
                key: "register",
                label: (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <UserAddOutlined /> Đăng ký mới
                  </span>
                ),
                children: (
                  <Form onFinish={handleRegister} layout="vertical" size="large">
                    <Form.Item
                      name="fullName"
                      rules={[{ required: true, message: "Vui lòng nhập họ và tên" }]}
                    >
                      <Input prefix={<IdcardOutlined />} placeholder="Họ và tên" />
                    </Form.Item>
                    <Form.Item
                      name="username"
                      rules={[{ required: true, message: "Vui lòng nhập tên đăng nhập" }]}
                    >
                      <Input prefix={<UserOutlined />} placeholder="Tên đăng nhập muốn tạo" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: "Vui lòng nhập mật khẩu" }]}
                    >
                      <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
                    </Form.Item>
                    <Form.Item
                      name="processId"
                      label={
                        <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                          <ApartmentOutlined style={{ marginRight: 6 }} />
                          Bạn thuộc bộ phận nào?
                        </span>
                      }
                      rules={[{ required: true, message: "Vui lòng chọn công đoạn" }]}
                    >
                      <Select
                        placeholder="Chọn công đoạn..."
                        options={processes.map((p: any) => ({
                          label: p.name,
                          value: p.id,
                        }))}
                      />
                    </Form.Item>
                    <Button
                      htmlType="submit"
                      loading={loading}
                      className="login-btn"
                    >
                      GỬI YÊU CẦU ĐĂNG KÝ
                    </Button>
                    <div className="login-notice">
                      <span className="login-notice-icon">⚠️</span>
                      <span>Tài khoản cần được Admin phê duyệt trước khi đăng nhập.</span>
                    </div>
                  </Form>
                ),
              },
            ]}
          />

          <div className="login-footer">© 2025 Phu Bai Production · All rights reserved</div>
        </div>
      </div>
    </>
  );
}