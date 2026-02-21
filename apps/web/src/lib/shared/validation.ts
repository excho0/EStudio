export const isFieldInvalid = (
  errors: Record<string, string>,
  field: string
) => Boolean(errors[field]);
