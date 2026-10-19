import { Edit, useForm } from "@refinedev/antd";
import { Form } from "antd";
import type { User } from "../../types";
import { showConflictOnField, toastUnlessConflict } from "../../utils/conflict";
import { UserFormFields } from "./form-fields";

export const UserEdit = () => {
  const { formProps, saveButtonProps, form } = useForm<User>({
    onMutationError: (error) => showConflictOnField(form, "email", error), // email taken → 409
    errorNotification: toastUnlessConflict,
  });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <UserFormFields isCreate={false} />
      </Form>
    </Edit>
  );
};
