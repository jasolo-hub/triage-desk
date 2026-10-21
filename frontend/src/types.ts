// Shapes mirror the API (see Swagger at `/api/docs`); the backend DTOs are the
// source of truth. Kept by hand because the two apps share no package
// (decision D1 in `docs/decisions.md`).
// `type` instead of `interface` on purpose: Refine's hooks require
// `T extends BaseRecord` (an index-signature type), which object type aliases
// satisfy implicitly and interfaces do not.

export type Role = "ADMIN" | "AGENT";
export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

/** `user` in login/refresh responses. */
export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

/** `users` resource (ADMIN only). */
export type User = AuthUser & {
  createdAt: string;
};

/** `agents` resource: read-only assignee source for both roles (D15). */
export type Agent = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

/** `{ tickets: ['list', 'show', ...], ... }` derived from the Casbin policy. */
export type Permissions = Record<string, string[]>;

/** `GET /auth/me` */
export type Me = AuthUser & {
  permissions: Permissions;
};

/** `POST /auth/login` and `POST /auth/refresh` */
export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type Customer = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  createdAt: string;
  ticketCount?: number;
};

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Ticket = {
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
};

/** `POST /uploads` response; `attachmentKey` on a new comment is `key`. */
export type Upload = {
  key: string;
  name: string;
  contentType: string;
  size: number;
};

/** `url` is a 5-minute presigned GET — never store it. */
export type Attachment = Upload & {
  url: string;
};

export type Comment = {
  id: number;
  ticketId: number;
  authorId: number;
  author: { id: number; name: string };
  body: string;
  isResolution: boolean;
  attachment: Attachment | null;
  createdAt: string;
};

/** `POST /tickets/bulk-transition` and `/tickets/bulk-assign` */
export type BulkResult = {
  updated: number[];
  /** Already in the requested state — a no-op, reported separately from failures. */
  skipped: number[];
  failed: { id: number; reason: string }[];
};

/** `GET /tickets/fields` — form help text, also the AI prompt context. */
export type TicketFieldOption = {
  value: string;
  label: string;
  help?: string;
};

export type TicketField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  help: string;
  readOnly?: boolean; // status: shown, but changed only via the transition action
  resource?: string; // reference fields: which resource the id points to
  options?: TicketFieldOption[];
};

export type TicketFields = {
  fields: TicketField[];
  rules: string[];
};

/** Nest's default error body. `message` is a string[] for validation errors. */
export type ApiErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
};
