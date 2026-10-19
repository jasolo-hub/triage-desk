import { Form, Input } from "antd";

// Shared by create and edit: the API body is `{ name, email, company? }`.
export const CustomerFormFields = () => (
  <>
    <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }]}>
      <Input />
    </Form.Item>
    <Form.Item label="Email" name="email" rules={[{ required: true, type: "email" }]}>
      <Input />
    </Form.Item>
    <Form.Item label="Company" name="company">
      <Input />
    </Form.Item>
  </>
);
