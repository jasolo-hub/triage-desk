import { useState } from "react";
import { CanAccess, type HttpError, useGetIdentity, useNotification } from "@refinedev/core";
import { DeleteButton, EditButton, SaveButton, useEditableTable, useForm } from "@refinedev/antd";
import { Button, Form, Input, Space, Table, Tag, theme, Typography, Upload, type UploadFile } from "antd";
import { PaperClipOutlined, UploadOutlined } from "@ant-design/icons";
import { RelativeDate } from "../../components/RelativeDate";
import { axiosInstance } from "../../providers/api";
import type { AuthUser, Comment, Upload as UploadResult } from "../../types";

// Same allowlist and limit as the API (which re-checks both on the real
// request). Checking here too just saves a pointless 5 MB upload.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
const MAX_BYTES = 5 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type Props = { ticketId: number };
type NewComment = { body: string; ticketId: number; attachmentKey?: string };

// The ticket's comments as an inline-editable table (the "inline editing of a
// related model" requirement) plus an add-comment form with an optional
// attachment.
export const TicketComments = ({ ticketId }: Props) => {
  const { token } = theme.useToken();
  const { data: me } = useGetIdentity<AuthUser>();

  const { tableProps, formProps, isEditing, saveButtonProps, cancelButtonProps, editButtonProps } =
    useEditableTable<Comment>({
      resource: "comments",
      filters: { permanent: [{ field: "ticketId", operator: "eq", value: ticketId }] },
      sorters: { initial: [{ field: "createdAt", order: "asc" }] },
      pagination: { pageSize: 50 },
      syncWithLocation: false, // embedded table: keep its state out of the ticket page URL
    });

  // Record rule from the API: author or ADMIN may edit (AGENT: own only).
  const mayEdit = (c: Comment) => me?.role === "ADMIN" || c.authorId === me?.id;

  return (
    <>
      <Typography.Title level={5}>Comments</Typography.Title>
      <Form {...formProps}>
        <Table
          {...tableProps}
          rowKey="id"
          size="small"
          onRow={(c) => ({ style: c.isResolution ? { background: token.colorSuccessBg } : undefined })}
        >
          <Table.Column<Comment>
            dataIndex={["author", "name"]}
            title="Author"
            width={200}
            render={(name, c) => (
              <Space direction="vertical" size={0}>
                {name}
                {c.isResolution && <Tag color="success">Resolution</Tag>}
              </Space>
            )}
          />
          <Table.Column<Comment>
            dataIndex="body"
            title="Comment"
            render={(body, c) =>
              isEditing(c.id) ? (
                <Form.Item name="body" style={{ margin: 0 }} rules={[{ required: true, whitespace: true }]}>
                  <Input.TextArea autoSize={{ minRows: 2 }} />
                </Form.Item>
              ) : (
                <Typography.Text style={{ whiteSpace: "pre-wrap" }}>{body}</Typography.Text>
              )
            }
          />
          <Table.Column<Comment>
            dataIndex="attachment"
            title="Attachment"
            width={200}
            render={(a: Comment["attachment"]) =>
              a && (
                // presigned GET, valid 5 min from when the list was loaded
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  <PaperClipOutlined /> {a.name} ({formatSize(a.size)})
                </a>
              )
            }
          />
          <Table.Column<Comment>
            dataIndex="createdAt"
            title="When"
            width={130}
            render={(value) => <RelativeDate value={value} />}
          />
          <Table.Column<Comment>
            title="Actions"
            width={110}
            render={(_, c) =>
              isEditing(c.id) ? (
                <Space>
                  <SaveButton {...saveButtonProps} hideText size="small" />
                  <Button {...cancelButtonProps} size="small">
                    Cancel
                  </Button>
                </Space>
              ) : (
                <Space>
                  {mayEdit(c) && <EditButton {...editButtonProps(c.id)} resource="comments" hideText size="small" />}
                  {/* ADMIN only (no `comments: delete` for AGENT → hidden) */}
                  <DeleteButton resource="comments" recordItemId={c.id} hideText size="small" />
                </Space>
              )
            }
          />
        </Table>
      </Form>

      <CanAccess resource="comments" action="create">
        <AddComment ticketId={ticketId} />
      </CanAccess>
    </>
  );
};

const AddComment = ({ ticketId }: Props) => {
  const { open } = useNotification();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const uploading = fileList.some((f) => f.status === "uploading");

  const { formProps, saveButtonProps, form } = useForm<Comment, HttpError, NewComment>({
    resource: "comments",
    action: "create",
    redirect: false,
    onMutationSuccess: () => {
      form.resetFields();
      setFileList([]);
      setUploaded(null);
    },
  });

  return (
    <Form
      {...formProps}
      layout="vertical"
      style={{ marginTop: 16 }}
      // ticketId comes from the page, the key from the upload — not form fields
      onFinish={(values) => formProps.onFinish?.({ ...values, ticketId, attachmentKey: uploaded?.key })}
    >
      <Form.Item name="body" label="Add a comment" rules={[{ required: true, whitespace: true }]}>
        <Input.TextArea rows={3} />
      </Form.Item>
      <Space align="start">
        <Upload
          maxCount={1}
          fileList={fileList}
          accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
          onChange={({ fileList }) => setFileList(fileList)}
          onRemove={() => setUploaded(null)}
          beforeUpload={(file) => {
            const problem = !ALLOWED_TYPES.includes(file.type)
              ? "Allowed: PNG, JPEG, WebP, PDF or plain text."
              : file.size > MAX_BYTES
                ? "The file is larger than 5 MB."
                : null;
            if (problem) {
              open?.({ type: "error", message: `Cannot attach ${file.name}`, description: problem });
              return Upload.LIST_IGNORE; // don't even add it to the list
            }
            return true;
          }}
          // Through our axios instance (Bearer + refresh), as multipart `file`.
          // The file goes to the API in memory and on to object storage (D6).
          customRequest={({ file, onSuccess, onError, onProgress }) => {
            const body = new FormData();
            body.append("file", file as File);
            axiosInstance
              .post<UploadResult>("/uploads", body, {
                onUploadProgress: (e) => onProgress?.({ percent: e.total ? (e.loaded / e.total) * 100 : 0 }),
              })
              .then(({ data }) => {
                setUploaded(data);
                onSuccess?.(data);
              })
              .catch((error: HttpError) => {
                open?.({ type: "error", message: "Upload failed", description: error.message });
                onError?.(new Error(error.message)); // marks the file red in the list
              });
          }}
        >
          <Button icon={<UploadOutlined />}>Attach file</Button>
        </Upload>
        <SaveButton {...saveButtonProps} disabled={uploading}>
          Add comment
        </SaveButton>
      </Space>
    </Form>
  );
};
