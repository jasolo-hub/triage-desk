import { useShow } from "@refinedev/core";
import { EmailField, Show, ShowButton, useTable } from "@refinedev/antd";
import { Descriptions, Table, Typography } from "antd";
import { RelativeDate } from "../../components/RelativeDate";
import { OverdueBadge } from "../../components/tickets/OverdueBadge";
import { PriorityTag } from "../../components/tickets/PriorityTag";
import { StatusTag } from "../../components/tickets/StatusTag";
import type { Customer, Ticket } from "../../types";

export const CustomerShow = () => {
  const { result: customer, query } = useShow<Customer>();

  return (
    <Show isLoading={query.isLoading} title={customer?.name ?? "Customer"}>
      {customer && (
        <>
          <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} style={{ marginBottom: 24 }}>
            <Descriptions.Item label="Email">
              <EmailField value={customer.email} />
            </Descriptions.Item>
            <Descriptions.Item label="Company">{customer.company ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Customer since">
              <RelativeDate value={customer.createdAt} />
            </Descriptions.Item>
            <Descriptions.Item label="Tickets">{customer.ticketCount ?? "—"}</Descriptions.Item>
          </Descriptions>
          <CustomerTickets customerId={customer.id} />
        </>
      )}
    </Show>
  );
};

// This customer's tickets, newest first — the same `customerId` filter the
// tickets list uses.
const CustomerTickets = ({ customerId }: { customerId: number }) => {
  const { tableProps } = useTable<Ticket>({
    resource: "tickets",
    filters: { permanent: [{ field: "customerId", operator: "eq", value: customerId }] },
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    syncWithLocation: false, // embedded table: keep its state out of this page's URL
  });

  return (
    <>
      <Typography.Title level={5}>Tickets</Typography.Title>
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column<Ticket> dataIndex="id" title="#" width={80} />
        <Table.Column<Ticket> dataIndex="title" title="Title" />
        <Table.Column<Ticket> dataIndex="status" title="Status" render={(s) => <StatusTag status={s} />} />
        <Table.Column<Ticket> dataIndex="priority" title="Priority" render={(p) => <PriorityTag priority={p} />} />
        <Table.Column<Ticket> dataIndex="isOverdue" title="SLA" render={(_, t) => <OverdueBadge ticket={t} />} />
        <Table.Column<Ticket> dataIndex="createdAt" title="Created" render={(v) => <RelativeDate value={v} />} />
        <Table.Column<Ticket>
          title=""
          render={(_, t) => <ShowButton resource="tickets" recordItemId={t.id} hideText size="small" />}
        />
      </Table>
    </>
  );
};
