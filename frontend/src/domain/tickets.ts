import type { AuthUser, Ticket, TicketPriority, TicketStatus } from "../types";

// Display data for the two enums. Labels match the `/tickets/fields` options;
// colours are a UI concern, so they live here rather than in the API.
export const STATUS: Record<TicketStatus, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "blue" },
  IN_PROGRESS: { label: "In progress", color: "gold" },
  RESOLVED: { label: "Resolved", color: "green" },
  CLOSED: { label: "Closed", color: "default" },
  REOPENED: { label: "Reopened", color: "magenta" },
};

export const PRIORITY: Record<TicketPriority, { label: string; color: string }> = {
  URGENT: { label: "Urgent", color: "red" },
  HIGH: { label: "High", color: "orange" },
  NORMAL: { label: "Normal", color: "blue" },
  LOW: { label: "Low", color: "default" },
};

export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, { label }]) => ({ value, label }));
export const PRIORITY_OPTIONS = Object.entries(PRIORITY).map(([value, { label }]) => ({ value, label }));

// Mirror of the backend's transition table, used ONLY to offer sensible
// choices in the UI. The backend's domain service is the rule: it answers 422
// for anything else (e.g. RESOLVED → REOPENED after the 7-day window, which
// the UI cannot know), and the UI shows that message.
export const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS"],
  CLOSED: [],
};

// Same ownership rule as the API (AGENT edits/moves only tickets assigned to
// them). Only decides whether to show the Edit / Change status controls.
export const canChangeTicket = (me: AuthUser | undefined, ticket: Pick<Ticket, "assigneeId">) =>
  me?.role === "ADMIN" || (me !== undefined && ticket.assigneeId === me.id);
