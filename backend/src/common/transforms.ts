import { Transform } from 'class-transformer';

// Applied by ValidationPipe({ transform: true }) before validators run.

export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

// Emails are unique in the DB; normalising case makes "Bob@x.io" and "bob@x.io"
// the same account/customer instead of two rows.
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
