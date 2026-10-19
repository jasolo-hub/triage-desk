import type { HttpError, OpenNotificationParams } from "@refinedev/core";
import type { FormInstance } from "antd";

// 409 = a unique constraint on the API (customer/user email, tag name; Prisma
// P2002 → ConflictException). It is a problem with one specific field, so we
// show the API's message under that field instead of as a toast:
//   useForm({ onMutationError: (e) => showConflictOnField(form, "email", e),
//             errorNotification: toastUnlessConflict })
export const showConflictOnField = (form: FormInstance, field: string, error: HttpError) => {
  if (error.statusCode === 409) form.setFields([{ name: field, errors: [error.message] }]);
};

// Refine's errorNotification: `false` = no toast (the field shows it).
export const toastUnlessConflict = (error?: HttpError): OpenNotificationParams | false =>
  error?.statusCode === 409
    ? false
    : { type: "error", message: `Could not save (${error?.statusCode ?? "network error"})`, description: error?.message };
