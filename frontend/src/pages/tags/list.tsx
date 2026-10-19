import React from "react";
import { BaseRecord } from "@refinedev/core";
import { useTable, List } from "@refinedev/antd";
import { Table, Space } from "antd";

export const TagList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="Id" />
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="color" title="Color" />
      </Table>
    </List>
  );
};
