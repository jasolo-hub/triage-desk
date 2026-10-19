import { Create, useForm } from "@refinedev/antd";
import { Form } from "antd";
import type { User } from "../../types";
import { showConflictOnField, toastUnlessConflict } from "../../utils/conflict";
import { UserFormFields } from "./form-fields";

export const UserCreate = () => {
  const { formProps, saveButtonProps, form } = useForm<User>({
    onMutationError: (error) => showConflictOnField(form, "email", error), // email taken → 409
    errorNotification: toastUnlessConflict,
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical" initialValues={{ role: "AGENT" }}>
        <UserFormFields isCreate />
      </Form>
    </Create>
  );
};
