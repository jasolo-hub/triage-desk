import { CanAccess, type HttpError } from "@refinedev/core";
import {
  DeleteButton,
  EditButton,
  getDefaultSortOrder,
  List,
  SaveButton,
  useEditableTable,
  useForm,
} from "@refinedev/antd";
import { Button, ColorPicker, Form, Input, Space, Table, Tag } from "antd";
import type { Color } from "antd/es/color-picker";
import type { Tag as TagRecord } from "../../types";
import { showConflictOnField, toastUnlessConflict } from "../../utils/conflict";

// ColorPicker works with Color objects; the API stores "#rrggbb".
const toHex = (color: Color) => color.toHexString();

// One page for tags: an inline-editable table plus an "add tag" row. Only
// ADMIN may mutate tags; for AGENT the accessControlProvider hides the Edit /
// Delete buttons and <CanAccess> hides the add form, so the table is read-only.
export const TagList = () => {
  const { tableProps, formProps, form, isEditing, saveButtonProps, cancelButtonProps, editButtonProps, sorters } =
    useEditableTable<TagRecord>({
      pagination: { pageSize: 50 }, // ~15 tags
      // Alphabetical by default (matches the API default); # and Name headers sort server-side.
      sorters: { initial: [{ field: "name", order: "asc" }] },
      // name is unique → 409 shown under the inline Name input
      onMutationError: (error) => showConflictOnField(form, "name", error),
      errorNotification: toastUnlessConflict,
    });

  return (
    <List>
      <CanAccess resource="tags" action="create">
        <AddTag />
      </CanAccess>

      <Form {...formProps}>
        <Table {...tableProps} rowKey="id">
          <Table.Column<TagRecord>
            dataIndex="id"
            title="#"
            width={80}
            sorter
            defaultSortOrder={getDefaultSortOrder("id", sorters)}
          />
          <Table.Column<TagRecord>
            dataIndex="name"
            title="Name"
            sorter
            defaultSortOrder={getDefaultSortOrder("name", sorters)}
            render={(name, tag) =>
              isEditing(tag.id) ? (
                <Form.Item name="name" style={{ margin: 0 }} rules={[{ required: true, whitespace: true }]}>
                  <Input />
                </Form.Item>
              ) : (
                <Tag color={tag.color}>{name}</Tag>
              )
            }
          />
          <Table.Column<TagRecord>
            dataIndex="color"
            title="Colour"
            render={(color, tag) =>
              isEditing(tag.id) ? (
                <Form.Item name="color" style={{ margin: 0 }} getValueFromEvent={toHex}>
                  <ColorPicker showText format="hex" disabledAlpha />
                </Form.Item>
              ) : (
                <code>{color}</code>
              )
            }
          />
          <Table.Column<TagRecord>
            title="Actions"
            width={140}
            render={(_, tag) =>
              isEditing(tag.id) ? (
                <Space>
                  <SaveButton {...saveButtonProps} hideText size="small" />
                  <Button {...cancelButtonProps} size="small">
                    Cancel
                  </Button>
                </Space>
              ) : (
                <Space>
                  <EditButton {...editButtonProps(tag.id)} hideText size="small" />
                  <DeleteButton recordItemId={tag.id} hideText size="small" />
                </Space>
              )
            }
          />
        </Table>
      </Form>
    </List>
  );
};

const AddTag = () => {
  const { formProps, saveButtonProps, form } = useForm<TagRecord, HttpError, Pick<TagRecord, "name" | "color">>({
    action: "create",
    redirect: false,
    onMutationSuccess: () => form.resetFields(),
    onMutationError: (error) => showConflictOnField(form, "name", error),
    errorNotification: toastUnlessConflict,
  });

  return (
    <Form {...formProps} layout="inline" initialValues={{ color: "#1677ff" }} style={{ marginBottom: 16 }}>
      <Form.Item name="name" rules={[{ required: true, whitespace: true, message: "Name the tag" }]}>
        <Input placeholder="New tag name" />
      </Form.Item>
      <Form.Item name="color" getValueFromEvent={toHex}>
        <ColorPicker showText format="hex" disabledAlpha />
      </Form.Item>
      <SaveButton {...saveButtonProps}>Add tag</SaveButton>
    </Form>
  );
};
