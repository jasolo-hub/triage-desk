import { useSelect } from "@refinedev/antd";
import { Form, Input, Select, Typography } from "antd";
import { useTicketFields } from "../../hooks/useTicketFields";
import type { Agent, Customer, Tag } from "../../types";

type Props = {
  /** Edit: ids already on the record, so the selects can show their labels. */
  defaults?: { customerId?: number; assigneeId?: number | null; tagIds?: number[] };
};

// Shared by create and edit: exactly the fields the API accepts
// (`title, description, priority, customerId, assigneeId, tagIds`). No
// `status` — the API rejects it on PATCH (400); it changes only through the
// transition action. Labels, tooltips and priority options come from
// `/tickets/fields`.
export const TicketFormFields = ({ defaults }: Props) => {
  const { help, label, field } = useTicketFields();

  // 800 customers: first page + server search on `name_like`.
  const { selectProps: customerSelectProps } = useSelect<Customer>({
    resource: "customers",
    optionLabel: "name",
    defaultValue: defaults?.customerId,
  });
  const { selectProps: agentSelectProps } = useSelect<Agent>({
    resource: "agents",
    optionLabel: "name",
    pagination: { pageSize: 100 },
    defaultValue: defaults?.assigneeId ?? undefined,
  });
  const { selectProps: tagSelectProps } = useSelect<Tag>({
    resource: "tags",
    optionLabel: "name",
    pagination: { pageSize: 100 },
    defaultValue: defaults?.tagIds,
  });

  // Each option carries its own help ("Service down … SLA 4h").
  // In the dropdown: label + help; once chosen, only the short label (optionLabelProp).
  const priorityOptions = (field("priority")?.options ?? []).map((o) => ({
    value: o.value,
    shortLabel: o.label,
    label: (
      <span title={o.help}>
        {o.label}{" "}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {o.help}
        </Typography.Text>
      </span>
    ),
  }));

  return (
    <>
      <Form.Item label={label("title", "Title")} name="title" tooltip={help("title")} rules={[{ required: true, max: 200 }]}>
        <Input />
      </Form.Item>
      <Form.Item
        label={label("description", "Description")}
        name="description"
        tooltip={help("description")}
        rules={[{ required: true }]}
      >
        <Input.TextArea rows={6} />
      </Form.Item>
      <Form.Item label={label("priority", "Priority")} name="priority" tooltip={help("priority")} rules={[{ required: true }]}>
        <Select options={priorityOptions} optionLabelProp="shortLabel" />
      </Form.Item>
      <Form.Item
        label={label("customerId", "Customer")}
        name="customerId"
        tooltip={help("customerId")}
        rules={[{ required: true }]}
      >
        <Select {...customerSelectProps} placeholder="Search by name" />
      </Form.Item>
      <Form.Item
        label={label("assigneeId", "Assignee")}
        name="assigneeId"
        tooltip={help("assigneeId")}
        // Clearing the select gives `undefined`, which PATCH would simply
        // omit (= "keep the assignee"). Send an explicit null to unassign.
        normalize={(value) => value ?? null}
      >
        <Select {...agentSelectProps} allowClear placeholder="Unassigned" />
      </Form.Item>
      <Form.Item label={label("tagIds", "Tags")} name="tagIds" tooltip={help("tagIds")} rules={[{ type: "array", max: 10 }]}>
        <Select {...tagSelectProps} mode="multiple" placeholder="No tags" />
      </Form.Item>
    </>
  );
};
