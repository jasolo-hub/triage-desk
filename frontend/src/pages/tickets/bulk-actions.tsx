import { useState } from "react";
import { useApiUrl, useCustomMutation, useInvalidate, useNotification } from "@refinedev/core";
import { useSelect } from "@refinedev/antd";
import { Button, Form, Input, Modal, Select, Space, Typography } from "antd";
import { STATUS_OPTIONS } from "../../domain/tickets";
import type { Agent, BulkResult, TicketStatus } from "../../types";

type Props = { selectedIds: number[]; onDone: () => void };
type Action = "assign" | "transition" | null;
type FormValues = { assigneeId?: number; status?: TicketStatus; comment?: string };

// Custom bulk actions on the selected rows (ADMIN only — the list renders this
// only when can(tickets, bulk); the API checks the same permission). Each id
// goes through the same domain rules as a single change, so the API reports
// partial success: `{ updated: [...], failed: [{ id, reason }] }`.
export const BulkActions = ({ selectedIds, onDone }: Props) => {
  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();
  const { open } = useNotification();
  const { mutate, mutation } = useCustomMutation<BulkResult>();
  const [action, setAction] = useState<Action>(null);
  const [form] = Form.useForm<FormValues>();
  const status = Form.useWatch("status", form);

  const { selectProps: agentSelectProps } = useSelect<Agent>({
    resource: "agents",
    optionLabel: "name",
    pagination: { pageSize: 100 }, // ~25 agents: load them all, search narrows
  });

  const close = () => {
    setAction(null);
    form.resetFields();
  };

  const showSummary = ({ updated, failed }: BulkResult) => {
    const total = updated.length + failed.length;
    open?.({
      type: failed.length ? "error" : "success",
      message: `Updated ${updated.length} of ${total} tickets`,
      description: failed.length
        ? failed.slice(0, 10).map((f) => `#${f.id}: ${f.reason}`).join("\n") +
          (failed.length > 10 ? `\n…and ${failed.length - 10} more` : "")
        : undefined,
    });
  };

  const submit = (values: FormValues) => {
    const isAssign = action === "assign";
    mutate(
      {
        url: `${apiUrl}/tickets/${isAssign ? "bulk-assign" : "bulk-transition"}`,
        method: "post",
        values: isAssign
          ? { ids: selectedIds, assigneeId: values.assigneeId ?? null } // empty = unassign
          : { ids: selectedIds, status: values.status, comment: values.comment || undefined },
        successNotification: false, // replaced by the summary below
      },
      {
        onSuccess: ({ data }) => {
          showSummary(data);
          invalidate({ resource: "tickets", invalidates: ["list"] });
          close();
          onDone();
        },
      },
    );
  };

  return (
    <>
      <Space>
        <Typography.Text type="secondary">{selectedIds.length} selected</Typography.Text>
        <Button onClick={() => setAction("assign")}>Assign to…</Button>
        <Button onClick={() => setAction("transition")}>Change status…</Button>
      </Space>

      <Modal
        open={action !== null}
        title={action === "assign" ? "Assign selected tickets" : "Change status of selected tickets"}
        okText="Apply"
        onOk={() => form.submit()}
        onCancel={close}
        confirmLoading={mutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          {action === "assign" ? (
            <Form.Item name="assigneeId" label="Assignee" extra="Leave empty to unassign.">
              <Select {...agentSelectProps} allowClear placeholder="Unassigned" />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="status" label="New status" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
              <Form.Item
                name="comment"
                label={status === "RESOLVED" ? "Resolution comment" : "Comment"}
                // the API requires it for RESOLVED; asking here saves a round trip
                rules={[{ required: status === "RESOLVED", message: "Resolving requires a resolution comment" }]}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
};
