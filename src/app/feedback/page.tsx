"use client";

import React, { useState } from "react";
import {
  Form,
  Input,
  Button,
  Radio,
  Card,
  Typography,
  Alert,
  Space,
} from "antd";
import { BulbOutlined, MessageOutlined, SendOutlined } from "@ant-design/icons";

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

export default function FeedbackPage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: { type: string; title: string; content: string }) => {
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gửi thất bại");
      setSuccess(true);
      form.resetFields();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <Title level={4} style={{ marginBottom: 4 }}>
        Góp ý & Đề xuất
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Ý kiến của bạn giúp hệ thống ngày càng tốt hơn. Phản hồi sẽ được gửi trực tiếp đến người phát triển.
      </Paragraph>

      <Card>
        {success && (
          <Alert
            type="success"
            message="Gửi thành công!"
            description="Cảm ơn bạn đã đóng góp ý kiến. Chúng tôi sẽ xem xét và phản hồi sớm nhất có thể."
            showIcon
            style={{ marginBottom: 24 }}
            closable
            onClose={() => setSuccess(false)}
          />
        )}
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ marginBottom: 24 }}
            closable
            onClose={() => setError(null)}
          />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ type: "feedback" }}>
          <Form.Item name="type" label="Loại phản hồi" rules={[{ required: true }]}>
            <Radio.Group>
              <Space direction="horizontal" size="large">
                <Radio value="feedback">
                  <Space>
                    <MessageOutlined style={{ color: "#1677ff" }} />
                    <span>Góp ý / Báo lỗi</span>
                  </Space>
                </Radio>
                <Radio value="idea">
                  <Space>
                    <BulbOutlined style={{ color: "#faad14" }} />
                    <span>Ý tưởng / Đề xuất tính năng</span>
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: "Vui lòng nhập tiêu đề" }]}
          >
            <Input placeholder="Mô tả ngắn gọn vấn đề hoặc ý tưởng của bạn" maxLength={100} showCount />
          </Form.Item>

          <Form.Item
            name="content"
            label="Nội dung chi tiết"
            rules={[{ required: true, message: "Vui lòng nhập nội dung" }]}
          >
            <TextArea
              rows={6}
              placeholder="Mô tả chi tiết: vấn đề gặp phải, bước tái hiện, hoặc ý tưởng bạn muốn đề xuất..."
              maxLength={2000}
              showCount
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              icon={<SendOutlined />}
              size="large"
            >
              Gửi phản hồi
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 12 }}>
        Phản hồi được gửi đến người phát triển qua email. Thông tin người gửi sẽ được đính kèm để thuận tiện liên lạc.
      </Text>
    </div>
  );
}
