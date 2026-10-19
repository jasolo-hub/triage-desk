import { Create, useForm } from "@refinedev/antd";
import { Form } from "antd";
import type { Ticket } from "../../types";
import { AiAssistant } from "../../components/AiAssistant";
import { TicketFormFields } from "./form-fields";

export const TicketCreate = () => {
  const { formProps, saveButtonProps } = useForm<Ticket>({ redirect: "show" });

  return (
    <Create saveButtonProps={saveButtonProps}>
      {/* status is always OPEN on create (API rule); NORMAL is the documented default priority */}
      <Form {...formProps} layout="vertical" initialValues={{ priority: "NORMAL" }}>
        <TicketFormFields />
      </Form>
      <AiAssistant />
    </Create>
  );
};
