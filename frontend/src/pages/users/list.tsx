import { useGetIdentity } from "@refinedev/core";
import { DeleteButton, EditButton, EmailField, List, useTable } from "@refinedev/antd";
import { Space, Table, Tag } from "antd";
import { RelativeDate } from "../../components/RelativeDate";
import type { AuthUser, User } from "../../types";

// ADMIN only: AGENT has no `users` permission, so the menu item is hidden and
// the route shows the 403 page (App.tsx); the API answers 403 regardless.
export const UserList = () => {
  const { tableProps } = useTable<User>();
  const { data: me } = useGetIdentity<AuthUser>();

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column<User> dataIndex="id" title="#" width={80} />
        <Table.Column<User> dataIndex="name" title="Name" />
        <Table.Column<User> dataIndex="email" title="Email" render={(value) => <EmailField value={value} />} />
        <Table.Column<User>
          dataIndex="role"
          title="Role"
          render={(role) => <Tag color={role === "ADMIN" ? "gold" : "blue"}>{role}</Tag>}
        />
        <Table.Column<User> dataIndex="createdAt" title="Created" render={(value) => <RelativeDate value={value} />} />
        <Table.Column<User>
          title="Actions"
          dataIndex="actions"
          render={(_, user) => (
            <Space>
              <EditButton hideText size="small" recordItemId={user.id} />
              {/* the API refuses to delete yourself (422) — don't offer it */}
              {user.id !== me?.id && <DeleteButton hideText size="small" recordItemId={user.id} />}
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
