import React from "react";
import { useShow, useOne, useMany } from "@refinedev/core";
import {
  Show,
  NumberField,
  TagField,
  TextField,
  MarkdownField,
  BooleanField,
  DateField,
} from "@refinedev/antd";
import { Typography } from "antd";

const { Title } = Typography;

export const TicketShow = () => {
  const {
    result: record,
    query: { isLoading },
  } = useShow();

  const {
    result: customerData,
    query: { isLoading: customerIsLoading },
  } = useOne({
    resource: "customers",
    id: record?.customerId || "",
    queryOptions: {
      enabled: !!record,
    },
  });

  const {
    result: tagsData,
    query: { isLoading: tagsIsLoading },
  } = useMany({
    resource: "tags",
    ids: record?.tags || [],
    queryOptions: {
      enabled: !!record && !!record?.tags?.length,
    },
  });

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Id</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>Title</Title>
      <TextField value={record?.title} />
      <Title level={5}>Description</Title>
      <MarkdownField value={record?.description} />
      <Title level={5}>Status</Title>
      <TextField value={record?.status} />
      <Title level={5}>Priority</Title>
      <TextField value={record?.priority} />
      <Title level={5}>Customer</Title>
      {customerIsLoading ? <>Loading...</> : <>{customerData?.name}</>}
      <Title level={5}>Tags</Title>
      {tagsIsLoading && record?.tags?.length ? (
        <>Loading...</>
      ) : (
        <>
          <span title="Inferencer failed to render this field (Cannot find relation)">
            Cannot Render
          </span>
        </>
      )}
      <Title level={5}>Is Overdue</Title>
      <BooleanField value={record?.isOverdue} />
      <Title level={5}>Sla Deadline</Title>
      <DateField value={record?.slaDeadline} />
      <Title level={5}>Resolved At</Title>
      <DateField value={record?.resolvedAt} />
      <Title level={5}>Created At</Title>
      <DateField value={record?.createdAt} />
      <Title level={5}>Updated At</Title>
      <DateField value={record?.updatedAt} />
    </Show>
  );
};
