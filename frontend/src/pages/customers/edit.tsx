import { Edit, useForm } from "@refinedev/antd";
import { Form } from "antd";
import type { Customer } from "../../types";
import { showConflictOnField, toastUnlessConflict } from "../../utils/conflict";
import { CustomerFormFields } from "./form-fields";

export const CustomerEdit = () => {
  const { formProps, saveButtonProps, form } = useForm<Customer>({
    // duplicate email → 409 → error under the Email field (see utils/conflict.ts)
    onMutationError: (error) => showConflictOnField(form, "email", error),
    errorNotification: toastUnlessConflict,
  });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <CustomerFormFields />
      </Form>
    </Edit>
  );
};
