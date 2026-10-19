import { Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import type { Ticket } from "../../types";

// `isOverdue` is computed by the API from createdAt + SLA(priority) (D11);
// the tooltip shows the deadline it was measured against.
export const OverdueBadge = ({ ticket }: { ticket: Pick<Ticket, "isOverdue" | "slaDeadline"> }) => {
  if (!ticket.isOverdue) return null;
  return (
    <Tooltip title={`SLA deadline was ${dayjs(ticket.slaDeadline).format("YYYY-MM-DD HH:mm")}`}>
      <Tag color="error">Overdue</Tag>
    </Tooltip>
  );
};
