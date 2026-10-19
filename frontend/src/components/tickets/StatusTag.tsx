import { Tag } from "antd";
import { STATUS } from "../../domain/tickets";
import type { TicketStatus } from "../../types";

export const StatusTag = ({ status }: { status: TicketStatus }) => (
  <Tag color={STATUS[status].color}>{STATUS[status].label}</Tag>
);
