import { getDefaultFilter, type HttpError } from "@refinedev/core";
import {
  DeleteButton,
  EditButton,
  EmailField,
  FilterDropdown,
  getDefaultSortOrder,
  List,
  ShowButton,
  useTable,
} from "@refinedev/antd";
import { Form, Input, Space, Table } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { RelativeDate } from "../../components/RelativeDate";
import type { Customer } from "../../types";

type SearchValues = { q?: string };

// Text columns filter with "contains" → `name_like` etc. on the API. Declaring
// the operator in `filters.initial` is how Refine knows which operator a
// column filter uses (otherwise it would send `name=` = exact match, which
// the API does not whitelist).
const textFilter = (field: "name" | "email" | "company") => ({ field, operator: "contains" as const, value: undefined });

export const CustomerList = () => {
  const { tableProps, searchFormProps, filters, sorters } = useTable<Customer, HttpError, SearchValues>({
    filters: { initial: [textFilter("name"), textFilter("email"), textFilter("company")] },
    sorters: { initial: [{ field: "name", order: "asc" }] },
    onSearch: ({ q }) => [{ field: "q", operator: "eq", value: q?.trim() || undefined }], // name OR email
  });

  const textColumnFilter = (placeholder: string) => (props: FilterDropdownProps) => (
    <FilterDropdown {...props}>
      <Input placeholder={placeholder} allowClear />
    </FilterDropdown>
  );

  return (
    <List>
      <Form {...searchFormProps} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="q" noStyle>
          <Input.Search
            placeholder="Search name or email"
            allowClear
            onSearch={() => searchFormProps.form?.submit()}
            style={{ width: 320 }}
          />
        </Form.Item>
      </Form>

      <Table {...tableProps} rowKey="id">
        <Table.Column<Customer> dataIndex="id" title="#" width={80} sorter defaultSortOrder={getDefaultSortOrder("id", sorters)} />
        <Table.Column<Customer>
          dataIndex="name"
          title="Name"
          sorter
          defaultSortOrder={getDefaultSortOrder("name", sorters)}
          defaultFilteredValue={getDefaultFilter("name", filters, "contains")}
          filterDropdown={textColumnFilter("Name contains")}
        />
        <Table.Column<Customer>
          dataIndex="email"
          title="Email"
          sorter
          defaultSortOrder={getDefaultSortOrder("email", sorters)}
          defaultFilteredValue={getDefaultFilter("email", filters, "contains")}
          filterDropdown={textColumnFilter("Email contains")}
          render={(value) => <EmailField value={value} />}
        />
        <Table.Column<Customer>
          dataIndex="company"
          title="Company"
          sorter
          defaultSortOrder={getDefaultSortOrder("company", sorters)}
          defaultFilteredValue={getDefaultFilter("company", filters, "contains")}
          filterDropdown={textColumnFilter("Company contains")}
          render={(value) => value ?? "—"}
        />
        <Table.Column<Customer> dataIndex="ticketCount" title="Tickets" width={90} />
        <Table.Column<Customer>
          dataIndex="createdAt"
          title="Customer since"
          sorter
          defaultSortOrder={getDefaultSortOrder("createdAt", sorters)}
          render={(value) => <RelativeDate value={value} />}
        />
        <Table.Column<Customer>
          title="Actions"
          dataIndex="actions"
          render={(_, customer) => (
            // Edit/Delete are hidden for AGENT by the accessControlProvider
            <Space>
              <ShowButton hideText size="small" recordItemId={customer.id} />
              <EditButton hideText size="small" recordItemId={customer.id} />
              <DeleteButton hideText size="small" recordItemId={customer.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
