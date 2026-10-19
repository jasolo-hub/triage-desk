import { useState } from "react";
import { CanAccess, type HttpError, useApiUrl, useCustomMutation } from "@refinedev/core";
import { Alert, Button, Drawer, FloatButton, Form, Input, Select, Typography } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { useTicketFields } from "../hooks/useTicketFields";

type Question = { question: string; field?: string };

// Small "how do I fill this in?" helper for the ticket pages. The API answers
// from the same `/tickets/fields` metadata the form uses (one grounded LLM
// call, D16). It is strictly optional: the drawer has no mask, so the form
// stays usable while it is open, and any failure is shown inline here.
export const AiAssistant = () => {
  const apiUrl = useApiUrl();
  const { fields } = useTicketFields();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<Question>();
  const { mutate, mutation } = useCustomMutation<{ answer: string }>();

  const ask = (values: Question) =>
    mutate({
      url: `${apiUrl}/ai/ask`,
      method: "post",
      values: { question: values.question.trim(), field: values.field },
      // shown inline below instead of as toasts
      successNotification: false,
      errorNotification: false,
    });

  const error = mutation.error as HttpError | null;

  return (
    <CanAccess resource="ai" action="ask">
      <FloatButton icon={<RobotOutlined />} type="primary" tooltip="Ask the assistant" onClick={() => setOpen(true)} />
      <Drawer title="Ticket assistant" open={open} onClose={() => setOpen(false)} mask={false} width={420}>
        <Typography.Paragraph type="secondary">
          Ask how to fill in a ticket field or how the workflow works. Answers come from the form's own field
          descriptions and rules.
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={ask}>
          <Form.Item name="field" label="About field (optional)">
            <Select allowClear placeholder="Any field" options={fields.map((f) => ({ value: f.name, label: f.label }))} />
          </Form.Item>
          <Form.Item name="question" label="Question" rules={[{ required: true, whitespace: true, max: 500 }]}>
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="e.g. Which priority for a single user who cannot log in?" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            Ask
          </Button>
        </Form>

        {error && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message={
              error.statusCode === 503
                ? "The assistant is unavailable right now — the form still works."
                : error.message // e.g. 429 "Too Many Requests", 400 validation
            }
          />
        )}
        {mutation.isSuccess && (
          <Alert
            style={{ marginTop: 16, whiteSpace: "pre-wrap" }}
            type="info"
            message="Answer"
            description={mutation.data.data.answer}
          />
        )}
      </Drawer>
    </CanAccess>
  );
};
