import { Form, Input, Select } from "antd";

type Props = { isCreate: boolean };

// Shared by create and edit. The password is required on create; on edit it
// is an optional "new password" — left empty, it is not sent at all.
export const UserFormFields = ({ isCreate }: Props) => (
  <>
    <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }]}>
      <Input />
    </Form.Item>
    <Form.Item label="Email" name="email" rules={[{ required: true, type: "email" }]}>
      <Input />
    </Form.Item>
    <Form.Item label="Role" name="role" rules={[{ required: true }]}>
      <Select
        options={[
          { value: "AGENT", label: "Agent — works on assigned tickets" },
          { value: "ADMIN", label: "Admin — full access" },
        ]}
      />
    </Form.Item>
    <Form.Item
      label={isCreate ? "Password" : "New password"}
      name="password"
      extra={isCreate ? undefined : "Leave empty to keep the current password."}
      rules={[{ required: isCreate }, { min: 8, message: "At least 8 characters" }]}
      // "" after clearing the input would fail the API's min-length check
      normalize={(value) => value || undefined}
    >
      <Input.Password autoComplete="new-password" />
    </Form.Item>
  </>
);
