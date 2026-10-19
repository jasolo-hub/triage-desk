import { useState } from "react";
import { useApiUrl, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Button, Dropdown, Form, Input, Modal } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { NEXT_STATUSES, STATUS } from "../../domain/tickets";
import type { Ticket, TicketStatus } from "../../types";

type Props = { ticket: Ticket };

// "Change status" offers only the transitions allowed from the current status
// (NEXT_STATUSES). Picking one opens a modal; RESOLVED requires a resolution
// comment, which the API stores as a comment in the same transaction (D9).
// Errors (422 rule violation, 409 changed meanwhile, 403 not your ticket)
// arrive as Refine's default error notification with the API's message.
export const TransitionControl = ({ ticket }: Props) => {
  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();
  const { mutate, mutation } = useCustomMutation<Ticket>();
  const [target, setTarget] = useState<TicketStatus | null>(null);
  const [form] = Form.useForm<{ comment?: string }>();

  const next = NEXT_STATUSES[ticket.status];
  if (next.length === 0) return null; // CLOSED is final

  const close = () => {
    setTarget(null);
    form.resetFields();
  };

  const submit = ({ comment }: { comment?: string }) => {
    if (!target) return;
    mutate(
      {
        url: `${apiUrl}/tickets/${ticket.id}/transition`,
        method: "post",
        values: { status: target, comment: comment?.trim() || undefined },
        successNotification: () => ({ type: "success", message: `Status changed to ${STATUS[target].label}` }),
      },
      {
        onSuccess: () => {
          // the ticket, the list, and (for a resolution comment) the thread changed
          invalidate({ resource: "tickets", id: ticket.id, invalidates: ["detail", "list"] });
          invalidate({ resource: "comments", invalidates: ["list"] });
          close();
        },
      },
    );
  };

  return (
    <>
      <Dropdown
        trigger={["click"]} // a button you click, not a hover menu
        menu={{
          items: next.map((status) => ({ key: status, label: STATUS[status].label })),
          onClick: ({ key }) => setTarget(key as TicketStatus),
        }}
      >
        <Button type="primary">
          Change status <DownOutlined />
        </Button>
      </Dropdown>

      <Modal
        open={target !== null}
        title={target && `${STATUS[ticket.status].label} → ${STATUS[target].label}`}
        okText="Change status"
        onOk={() => form.submit()}
        onCancel={close}
        confirmLoading={mutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="comment"
            label={target === "RESOLVED" ? "Resolution comment" : "Comment (optional)"}
            extra={target === "RESOLVED" ? "What fixed the issue? Saved as a resolution comment." : undefined}
            rules={[{ required: target === "RESOLVED", whitespace: true, message: "Resolving requires a resolution comment" }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
