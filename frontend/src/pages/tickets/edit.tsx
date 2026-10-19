import { Edit, useForm } from "@refinedev/antd";
import { Form } from "antd";
import type { Ticket } from "../../types";
import { StatusTag } from "../../components/tickets/StatusTag";
import { TicketFormFields } from "./form-fields";

export const TicketEdit = () => {
  const { formProps, saveButtonProps, query } = useForm<Ticket>({ redirect: "show" });
  const ticket = query?.data?.data;

  return (
    <Edit
      saveButtonProps={saveButtonProps}
      // read-only here; change it with "Change status" on the ticket page
      title={ticket ? <>Edit ticket #{ticket.id} <StatusTag status={ticket.status} /></> : "Edit ticket"}
    >
      <Form
        {...formProps}
        layout="vertical"
        // The API returns `tags: Tag[]` but takes `tagIds: number[]`.
        initialValues={ticket && { ...ticket, tagIds: ticket.tags.map((t) => t.id) }}
      >
        <TicketFormFields
          defaults={ticket && { customerId: ticket.customerId, assigneeId: ticket.assigneeId, tagIds: ticket.tags.map((t) => t.id) }}
        />
      </Form>
    </Edit>
  );
};
