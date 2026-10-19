import React from "react";
import { useShow } from "@refinedev/core";
import {
  Show,
  NumberField,
  TagField,
  TextField,
  EmailField,
  DateField,
} from "@refinedev/antd";
import { Typography } from "antd";

const { Title } = Typography;

export const CustomerShow = () => {
  const {
    result: record,
    query: { isLoading },
  } = useShow();

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Id</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>Name</Title>
      <TextField value={record?.name} />
      <Title level={5}>Email</Title>
      <EmailField value={record?.email} />
      <Title level={5}>Company</Title>
      <TextField value={record?.company} />
      <Title level={5}>Created At</Title>
      <DateField value={record?.createdAt} />
      <Title level={5}>Ticket Count</Title>
      <NumberField value={record?.ticketCount ?? ""} />
    </Show>
  );
};
