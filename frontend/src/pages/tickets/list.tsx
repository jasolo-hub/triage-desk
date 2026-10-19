import React from "react";
import { BaseRecord, useMany } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
  MarkdownField,
  TagField,
  BooleanField,
  DateField,
} from "@refinedev/antd";
import { Table, Space } from "antd";

export const TicketList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  const {
    result: customerData,
    query: { isLoading: customerIsLoading },
  } = useMany({
    resource: "customers",
    ids: tableProps?.dataSource?.map((item) => item?.customerId) ?? [],
    queryOptions: {
      enabled: !!tableProps?.dataSource,
    },
  });

  const {
    result: tagsData,
    query: { isLoading: tagsIsLoading },
  } = useMany({
    resource: "tags",
    ids: [].concat(
      ...(tableProps?.dataSource?.map((item) => item?.tags) ?? [])
    ),
    queryOptions: {
      enabled: !!tableProps?.dataSource,
    },
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="Id" />
        <Table.Column dataIndex="title" title="Title" />
        <Table.Column
          dataIndex="description"
          title="Description"
          render={(value: any) => (
            <MarkdownField value={value.slice(0, 80) + "..."} />
          )}
        />
        <Table.Column dataIndex="status" title="Status" />
        <Table.Column dataIndex="priority" title="Priority" />
        <Table.Column
          dataIndex={["customerId"]}
          title="Customer"
          render={(value) =>
            customerIsLoading ? (
              <>Loading...</>
            ) : (
              customerData?.data?.find((item) => item.id === value)?.name
            )
          }
        />

        <Table.Column dataIndex={["assignee", "name"]} title="Assignee" />
        <Table.Column
          dataIndex="tags"
          title="Tags"
          render={(value: any[]) =>
            tagsIsLoading ? (
              <>Loading...</>
            ) : (
              <>
                {value?.map((item, index) => (
                  <TagField key={index} value={item} />
                ))}
              </>
            )
          }
        />
        <Table.Column
          dataIndex={["isOverdue"]}
          title="Is Overdue"
          render={(value: any) => <BooleanField value={value} />}
        />
        <Table.Column
          dataIndex={["slaDeadline"]}
          title="Sla Deadline"
          render={(value: any) => <DateField value={value} />}
        />
        <Table.Column
          dataIndex={["resolvedAt"]}
          title="Resolved At"
          render={(value: any) => <DateField value={value} />}
        />
        <Table.Column
          dataIndex={["createdAt"]}
          title="Created At"
          render={(value: any) => <DateField value={value} />}
        />
        <Table.Column
          dataIndex={["updatedAt"]}
          title="Updated At"
          render={(value: any) => <DateField value={value} />}
        />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
