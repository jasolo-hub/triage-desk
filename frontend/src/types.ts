// Shapes from notes/API_CONTRACT.md. Kept by hand (D1: no shared package for
// ~10 interfaces); the backend DTOs are the source of truth.

export type Role = "ADMIN" | "AGENT";
export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

/** `user` in login/refresh responses. */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

/** `users` resource (ADMIN only). */
export interface User extends AuthUser {
  createdAt: string;
}

/** `agents` resource: read-only assignee source for both roles (D15). */
export interface Agent {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/** `{ tickets: ['list', 'show', ...], ... }` derived from the Casbin policy. */
export type Permissions = Record<string, string[]>;

/** `GET /auth/me` */
export interface Me extends AuthUser {
  permissions: Permissions;
}

/** `POST /auth/login` and `POST /auth/refresh` */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  company: string | null;
  createdAt: string;
  ticketCount?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: number;
  customer: Pick<Customer, "id" | "name" | "email">;
  assigneeId: number | null;
  assignee: Pick<Agent, "id" | "name"> | null;
  tags: Tag[];
  isOverdue: boolean;
  slaDeadline: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /uploads` response; `attachmentKey` on a new comment is `key`. */
export interface Upload {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

/** `url` is a 5-minute presigned GET — never store it. */
export interface Attachment extends Upload {
  url: string;
}

export interface Comment {
  id: number;
  ticketId: number;
  authorId: number;
  author: { id: number; name: string };
  body: string;
  isResolution: boolean;
  attachment: Attachment | null;
  createdAt: string;
}

/** `POST /tickets/bulk-transition` and `/tickets/bulk-assign` */
export interface BulkResult {
  updated: number[];
  failed: { id: number; reason: string }[];
}

/** `GET /tickets/fields` — form help text, also the AI prompt context. */
export interface TicketFieldOption {
  value: string;
  label: string;
  help?: string;
}

export interface TicketField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  help: string;
  options?: TicketFieldOption[];
}

export interface TicketFields {
  fields: TicketField[];
  rules: string[];
}

/** Nest's default error body. `message` is a string[] for validation errors. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
