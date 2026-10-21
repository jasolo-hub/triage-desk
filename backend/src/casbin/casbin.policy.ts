// D4: model + policy are code. Two static roles, no runtime policy editing, so a
// DB adapter would add a table and a sync step for data that never changes.

// Subject = role string. Action column holds a "|" list; the matcher anchors it
// (^(...)$) so "list" never matches e.g. "listAll" by accident.
export const CASBIN_MODEL = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.sub == p.sub && r.obj == p.obj && regexMatch(r.act, "^(" + p.act + ")$")
`;

// Record-level rules are NOT here (they need the record): an AGENT may edit /
// transition only tickets assigned to them and edit only their own comments —
// checked in TicketsService / CommentsService. Casbin answers "may this role do
// this action on this resource at all".
export const CASBIN_POLICY = `
p, ADMIN, tickets, list|show|create|edit|delete|transition|bulk
p, ADMIN, customers, list|show|create|edit|delete
p, ADMIN, comments, list|create|edit|delete
p, ADMIN, tags, list|show|create|edit|delete
p, ADMIN, users, list|show|create|edit|delete
p, ADMIN, agents, list
p, ADMIN, uploads, create
p, ADMIN, ai, ask

p, AGENT, tickets, list|show|create|edit|transition
p, AGENT, customers, list|show
p, AGENT, comments, list|create|edit
p, AGENT, tags, list
p, AGENT, agents, list
p, AGENT, uploads, create
p, AGENT, ai, ask
`;
