import { useState } from "react";
import { getDefaultFilter, type HttpError, useCan, useGetIdentity } from "@refinedev/core";
import {
  DeleteButton,
  EditButton,
  FilterDropdown,
  getDefaultSortOrder,
  List,
  ShowButton,
  useSelect,
  useTable,
} from "@refinedev/antd";
import { Form, Input, Radio, Select, Space, Table } from "antd";
import { RelativeDate } from "../../components/RelativeDate";
import { TagList } from "../../components/TagList";
import { OverdueBadge } from "../../components/tickets/OverdueBadge";
import { PriorityTag } from "../../components/tickets/PriorityTag";
import { StatusTag } from "../../components/tickets/StatusTag";
import { canChangeTicket, PRIORITY_OPTIONS, STATUS_OPTIONS } from "../../domain/tickets";
import type { Agent, AuthUser, Customer, Ticket } from "../../types";
import { BulkActions } from "./bulk-actions";

type SearchValues = { q?: string };

// Ids come back from the URL as strings (syncWithLocation); selects use numbers.
const toNumbers = (keys: React.Key[] | undefined) => (keys ?? []).map(Number);

export const TicketList = () => {
  // Column filters, sort and page live in the URL (global syncWithLocation).
  // Every filter `field` below is on the API's whitelist for /tickets.
  const { tableProps, searchFormProps, filters, sorters } = useTable<Ticket, HttpError, SearchValues>({
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    // Search box → `q` (title OR description, ILIKE on the API). An empty box
    // must drop the filter: `undefined` is removed, "" would be sent as `q=`.
    onSearch: ({ q }) => [{ field: "q", operator: "eq", value: q?.trim() || undefined }],
  });

  const { data: me } = useGetIdentity<AuthUser>();
  const { data: canBulk } = useCan({ resource: "tickets", action: "bulk" });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { selectProps: agentSelectProps } = useSelect<Agent>({
    resource: "agents",
    optionLabel: "name",
    pagination: { pageSize: 100 },
    defaultValue: toNumbers(getDefaultFilter("assigneeId", filters, "in")),
  });
  // 800 customers: load 10, then search by name (`name_like`, useSelect's
  // default "contains" on optionLabel).
  const { selectProps: customerSelectProps } = useSelect<Customer>({
    resource: "customers",
    optionLabel: "name",
    defaultValue: toNumbers(getDefaultFilter("customerId", filters, "in")),
  });

  return (
    <List>
      <Space wrap style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Form {...searchFormProps} layout="inline">
          <Form.Item name="q" noStyle>
            <Input.Search
              placeholder="Search title or description"
              allowClear
              onSearch={() => searchFormProps.form?.submit()}
              style={{ width: 320 }}
            />
          </Form.Item>
        </Form>
        {canBulk?.can && selectedIds.length > 0 && (
          <BulkActions selectedIds={selectedIds} onDone={() => setSelectedIds([])} />
        )}
      </Space>

      <Table
        {...tableProps}
        rowKey="id"
        rowSelection={
          canBulk?.can
            ? { selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(Number)) }
            : undefined
        }
      >
        <Table.Column<Ticket> dataIndex="id" title="#" width={80} sorter defaultSortOrder={getDefaultSortOrder("id", sorters)} />
        <Table.Column<Ticket> dataIndex="title" title="Title" sorter defaultSortOrder={getDefaultSortOrder("title", sorters)} />
        <Table.Column<Ticket>
          dataIndex="status"
          title="Status"
          sorter
          defaultSortOrder={getDefaultSortOrder("status", sorters)}
          render={(status) => <StatusTag status={status} />}
          defaultFilteredValue={getDefaultFilter("status", filters, "in")}
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select mode="multiple" options={STATUS_OPTIONS} placeholder="Any status" style={{ minWidth: 200 }} />
            </FilterDropdown>
          )}
        />
        <Table.Column<Ticket>
          dataIndex="priority"
          title="Priority"
          sorter
          defaultSortOrder={getDefaultSortOrder("priority", sorters)}
          render={(priority) => <PriorityTag priority={priority} />}
          defaultFilteredValue={getDefaultFilter("priority", filters, "in")}
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select mode="multiple" options={PRIORITY_OPTIONS} placeholder="Any priority" style={{ minWidth: 200 }} />
            </FilterDropdown>
          )}
        />
        <Table.Column<Ticket>
          dataIndex="isOverdue"
          title="SLA"
          render={(_, ticket) => <OverdueBadge ticket={ticket} />}
          defaultFilteredValue={getDefaultFilter("isOverdue", filters, "in")}
          filterDropdown={(props) => (
            // antd keeps filter values as key arrays; a radio has one value
            <FilterDropdown {...props} mapValue={(keys, event) => (event === "onChange" ? [keys] : keys?.[0])}>
              <Radio.Group
                options={[
                  { value: "true", label: "Overdue" },
                  { value: "false", label: "On time" },
                ]}
              />
            </FilterDropdown>
          )}
        />
        <Table.Column<Ticket>
          // dataIndex is the filter field (`customerId`); the name comes
          // embedded in the record, so no extra request per row.
          dataIndex="customerId"
          title="Customer"
          render={(_, ticket) => ticket.customer.name}
          defaultFilteredValue={getDefaultFilter("customerId", filters, "in")}
          filterDropdown={(props) => (
            <FilterDropdown {...props} mapValue={toNumbers}>
              <Select mode="multiple" {...customerSelectProps} placeholder="Search customers" style={{ minWidth: 240 }} />
            </FilterDropdown>
          )}
        />
        <Table.Column<Ticket>
          dataIndex="assigneeId"
          title="Assignee"
          render={(_, ticket) => ticket.assignee?.name ?? "Unassigned"}
          defaultFilteredValue={getDefaultFilter("assigneeId", filters, "in")}
          filterDropdown={(props) => (
            <FilterDropdown {...props} mapValue={toNumbers}>
              <Select mode="multiple" {...agentSelectProps} placeholder="Any assignee" style={{ minWidth: 220 }} />
            </FilterDropdown>
          )}
        />
        <Table.Column<Ticket> dataIndex="tags" title="Tags" render={(tags) => <TagList tags={tags} />} />
        <Table.Column<Ticket>
          dataIndex="createdAt"
          title="Created"
          sorter
          defaultSortOrder={getDefaultSortOrder("createdAt", sorters)}
          render={(value) => <RelativeDate value={value} />}
        />
        <Table.Column<Ticket>
          dataIndex="updatedAt"
          title="Updated"
          sorter
          defaultSortOrder={getDefaultSortOrder("updatedAt", sorters)}
          render={(value) => <RelativeDate value={value} />}
        />
        <Table.Column<Ticket>
          title="Actions"
          dataIndex="actions"
          render={(_, ticket) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={ticket.id} />
              {/* AGENT has `edit` in its policy but only for its own tickets
                  (record rule, checked in TicketsService) */}
              {canChangeTicket(me, ticket) && <EditButton hideText size="small" recordItemId={ticket.id} />}
              {/* hidden for AGENT by the accessControlProvider (no `delete`) */}
              <DeleteButton hideText size="small" recordItemId={ticket.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
