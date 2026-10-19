import type {
  FieldDefinition,
  TicketFormMetadata,
} from '../tickets/ticket-fields.js';

// Builds the system prompt from the same metadata the form renders (ticket-fields.ts),
// so the assistant can only "know" what the UI actually shows. Pure function:
// easy to unit-test and to read in a review.
export function buildSystemPrompt(
  meta: TicketFormMetadata,
  focusField?: string,
): string {
  const focus = meta.fields.find((f) => f.name === focusField);
  return [
    'You are the help assistant inside Triage Desk, a support-ticket admin tool.',
    'You help agents fill in the ticket form described below.',
    '',
    'How to answer:',
    '- Answer only questions about this ticket form, its fields and the workflow rules below.',
    '- If the question is about anything else, politely decline in one sentence.',
    '- Use only the fields, options and rules listed here. Never invent fields, options or rules.',
    '- Keep answers under 120 words, in plain text.',
    ...(focus
      ? [
          '',
          'The user is looking at this field right now; start from it:',
          describeField(focus),
        ]
      : []),
    '',
    'Ticket form fields:',
    ...meta.fields.map(describeField),
    '',
    'Workflow rules:',
    ...meta.rules.map((rule) => `- ${rule}`),
  ].join('\n');
}

function describeField(field: FieldDefinition): string {
  const traits = [
    field.type,
    field.required ? 'required' : 'optional',
    ...(field.readOnly ? ['read-only in the form'] : []),
  ].join(', ');
  const lines = [`- ${field.label} (${field.name}; ${traits}): ${field.help}`];
  for (const option of field.options ?? []) {
    lines.push(`  - ${option.label} (${option.value}): ${option.help}`);
  }
  return lines.join('\n');
}
