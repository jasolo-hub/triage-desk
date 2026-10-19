import {
  SLA_HOURS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketPriority,
  TicketStatus,
} from './ticket-workflow.js';

// Single source of truth for the ticket form: served by GET /tickets/fields,
// rendered as help tooltips by the frontend, and used as grounding context by
// the AI assistant. Change the wording here and all three follow.

export interface FieldOption {
  value: string;
  label: string;
  help: string;
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: 'string' | 'text' | 'enum' | 'reference' | 'reference[]';
  required: boolean;
  help: string;
  /** Present for enums. */
  options?: FieldOption[];
  /** For references: which API resource the ids point to. */
  resource?: string;
  /** Shown but not editable in the form (status changes go through transitions). */
  readOnly?: boolean;
}

export interface TicketFormMetadata {
  fields: FieldDefinition[];
  rules: string[];
}

export const MAX_TAGS_PER_TICKET = 10;

/** Field names are static (only help texts vary), so DTOs can validate against them. */
export const TICKET_FIELD_NAMES = [
  'title',
  'description',
  'priority',
  'status',
  'customerId',
  'assigneeId',
  'tagIds',
] as const;

const PRIORITY_TEXT: Record<TicketPriority, { label: string; help: string }> = {
  URGENT: {
    label: 'Urgent',
    help: 'Service down or data loss for this customer and no workaround.',
  },
  HIGH: {
    label: 'High',
    help: 'A core feature is broken or many users are affected; a workaround exists but is painful.',
  },
  NORMAL: {
    label: 'Normal',
    help: 'One user is affected, or a question is blocking part of their work.',
  },
  LOW: {
    label: 'Low',
    help: 'Cosmetic issue, feature request or general question.',
  },
};

function statusText(
  reopenWindowDays: number,
): Record<TicketStatus, { label: string; help: string }> {
  return {
    OPEN: {
      label: 'Open',
      help: 'New ticket, nobody has started working on it yet.',
    },
    IN_PROGRESS: {
      label: 'In progress',
      help: 'An agent is actively working on it.',
    },
    RESOLVED: {
      label: 'Resolved',
      help: 'A fix or answer was given to the customer. Requires a resolution comment.',
    },
    CLOSED: {
      label: 'Closed',
      help: 'Confirmed done. Final state, cannot be reopened.',
    },
    REOPENED: {
      label: 'Reopened',
      help: `The customer came back within ${reopenWindowDays} days of the resolution.`,
    },
  };
}

function hoursLabel(hours: number): string {
  if (hours < 48 || hours % 24 !== 0) return `${hours}h`;
  return `${hours}h (${hours / 24} days)`;
}

export function ticketFormMetadata(
  reopenWindowDays: number,
): TicketFormMetadata {
  const statuses = statusText(reopenWindowDays);
  const slaSummary = TICKET_PRIORITIES.map((p) => `${p} ${SLA_HOURS[p]}h`).join(
    ', ',
  );

  return {
    fields: [
      {
        name: 'title',
        label: 'Title',
        type: 'string',
        required: true,
        help: 'One-line summary the customer would recognise, e.g. "Cannot log in after password reset". Max 200 characters.',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'text',
        required: true,
        help: 'What happened, what the customer expected instead, steps to reproduce and any exact error messages. Write it so a colleague can take over without asking questions.',
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'enum',
        required: true,
        help: 'Drives the SLA: a ticket that is not resolved within its window (counted from creation) becomes overdue. Choose by business impact, not by how urgent the customer sounds. Defaults to Normal.',
        options: TICKET_PRIORITIES.map((p) => ({
          value: p,
          label: PRIORITY_TEXT[p].label,
          help: `${PRIORITY_TEXT[p].help} SLA ${hoursLabel(SLA_HOURS[p])}.`,
        })),
      },
      {
        name: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        readOnly: true,
        help: 'Where the ticket is in its lifecycle. New tickets start as Open. Status is changed only with the status action, which enforces the workflow rules.',
        options: TICKET_STATUSES.map((s) => ({ value: s, ...statuses[s] })),
      },
      {
        name: 'customerId',
        label: 'Customer',
        type: 'reference',
        resource: 'customers',
        required: true,
        help: 'The customer who reported the issue. Search by name or email; create the customer first if they are new.',
      },
      {
        name: 'assigneeId',
        label: 'Assignee',
        type: 'reference',
        resource: 'agents',
        required: false,
        help: 'The agent responsible for the next step. Agents can only edit and move tickets assigned to them. Leave empty to keep the ticket in the unassigned queue.',
      },
      {
        name: 'tagIds',
        label: 'Tags',
        type: 'reference[]',
        resource: 'tags',
        required: false,
        help: `Optional labels for routing and reporting, e.g. billing or bug. Up to ${MAX_TAGS_PER_TICKET} per ticket; only admins create new tags.`,
      },
    ],
    rules: [
      `Status flow: OPEN → IN_PROGRESS → RESOLVED → CLOSED. RESOLVED → REOPENED within ${reopenWindowDays} days of resolution. REOPENED → IN_PROGRESS. Any other change is rejected.`,
      'Resolving requires a resolution comment explaining what fixed the issue.',
      `A ticket is overdue when it is not RESOLVED/CLOSED and older than its priority SLA (${slaSummary}).`,
      'Agents can edit and change the status only of tickets assigned to them; admins can change any ticket.',
    ],
  };
}
