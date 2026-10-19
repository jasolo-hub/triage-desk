import React from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, Checkbox, DatePicker } from "antd";
import dayjs from "dayjs";

export const TicketEdit = () => {
  const { formProps, saveButtonProps, query } = useForm();

  const ticketsData = query?.data?.data;

  const { selectProps: customerSelectProps } = useSelect({
    resource: "customers",
    defaultValue: ticketsData?.customerId,
    optionLabel: "name",
  });

  const { selectProps: tagsSelectProps } = useSelect({
    resource: "tags",
    defaultValue: ticketsData?.tags,
  });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Id"
          name={["id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input readOnly disabled />
        </Form.Item>
        <Form.Item
          label="Title"
          name={["title"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Description"
          name="description"
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input.TextArea rows={5} />
        </Form.Item>
        <Form.Item
          label="Status"
          name={["status"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Priority"
          name={["priority"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Customer"
          name={"customerId"}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select {...customerSelectProps} />
        </Form.Item>
        <Form.Item
          label="Tags"
          name={"tags"}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select mode="multiple" {...tagsSelectProps} />
        </Form.Item>
        <Form.Item
          label="Is Overdue"
          valuePropName="checked"
          name={["isOverdue"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Checkbox>Is Overdue</Checkbox>
        </Form.Item>
        <Form.Item
          label="Sla Deadline"
          name={["slaDeadline"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker />
        </Form.Item>
        <Form.Item
          label="Resolved At"
          name={["resolvedAt"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker />
        </Form.Item>
        <Form.Item
          label="Created At"
          name={["createdAt"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker />
        </Form.Item>
        <Form.Item
          label="Updated At"
          name={["updatedAt"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker />
        </Form.Item>
      </Form>
    </Edit>
  );
};
