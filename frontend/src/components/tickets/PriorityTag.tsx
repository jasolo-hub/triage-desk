import { Tag } from "antd";
import { PRIORITY } from "../../domain/tickets";
import type { TicketPriority } from "../../types";

export const PriorityTag = ({ priority }: { priority: TicketPriority }) => (
  <Tag color={PRIORITY[priority].color}>{PRIORITY[priority].label}</Tag>
);
