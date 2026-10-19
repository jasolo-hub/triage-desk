import { useCan, useGetIdentity, useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Space, Typography } from "antd";
import { Link } from "react-router";
import { RelativeDate } from "../../components/RelativeDate";
import { TagList } from "../../components/TagList";
import { OverdueBadge } from "../../components/tickets/OverdueBadge";
import { PriorityTag } from "../../components/tickets/PriorityTag";
import { StatusTag } from "../../components/tickets/StatusTag";
import { canChangeTicket } from "../../domain/tickets";
import type { AuthUser, Ticket } from "../../types";
import { TicketComments } from "./comments";
import { TransitionControl } from "./transition-control";

export const TicketShow = () => {
  const { result: ticket, query } = useShow<Ticket>();
  const { data: me } = useGetIdentity<AuthUser>();
  const { data: canTransition } = useCan({ resource: "tickets", action: "transition" });

  // Role permission (policy) AND record rule (assigned to me, or ADMIN).
  const mayChange = !!ticket && canChangeTicket(me, ticket);

  return (
    <Show
      isLoading={query.isLoading}
      canEdit={mayChange}
      title={ticket ? `Ticket #${ticket.id}` : "Ticket"}
      headerButtons={({ defaultButtons }) => (
        <>
          {ticket && mayChange && canTransition?.can && <TransitionControl ticket={ticket} />}
          {defaultButtons}
        </>
      )}
    >
      {ticket && (
        <>
          <Space align="center" wrap style={{ marginBottom: 16 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {ticket.title}
            </Typography.Title>
            <StatusTag status={ticket.status} />
            <PriorityTag priority={ticket.priority} />
            <OverdueBadge ticket={ticket} />
          </Space>

          {/* plain text, not Markdown: user input is rendered escaped (D2 XSS note) */}
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</Typography.Paragraph>

          <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} style={{ marginBottom: 24 }}>
            <Descriptions.Item label="Customer">
              <Link to={`/customers/show/${ticket.customer.id}`}>{ticket.customer.name}</Link>{" "}
              <Typography.Text type="secondary">{ticket.customer.email}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Assignee">{ticket.assignee?.name ?? "Unassigned"}</Descriptions.Item>
            <Descriptions.Item label="Tags">
              {ticket.tags.length ? <TagList tags={ticket.tags} /> : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="SLA deadline">
              <RelativeDate value={ticket.slaDeadline} />
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              <RelativeDate value={ticket.createdAt} />
            </Descriptions.Item>
            <Descriptions.Item label="Updated">
              <RelativeDate value={ticket.updatedAt} />
            </Descriptions.Item>
            {ticket.resolvedAt && (
              <Descriptions.Item label="Resolved">
                <RelativeDate value={ticket.resolvedAt} />
              </Descriptions.Item>
            )}
          </Descriptions>

          <TicketComments ticketId={ticket.id} />
        </>
      )}
    </Show>
  );
};
