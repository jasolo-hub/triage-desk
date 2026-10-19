import { ticketFormMetadata } from '../tickets/ticket-fields.js';
import { buildSystemPrompt } from './ai.prompt.js';

const meta = ticketFormMetadata(7);

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(meta);

  it('contains every field label and its help text', () => {
    for (const field of meta.fields) {
      expect(prompt).toContain(field.label);
      expect(prompt).toContain(field.help);
    }
  });

  it('contains every option with its help (e.g. the SLA per priority)', () => {
    for (const option of meta.fields.flatMap((f) => f.options ?? [])) {
      expect(prompt).toContain(
        `${option.label} (${option.value}): ${option.help}`,
      );
    }
    expect(prompt).toContain('SLA 4h');
  });

  it('contains every workflow rule', () => {
    for (const rule of meta.rules) expect(prompt).toContain(rule);
  });

  it('tells the model to stay on topic and not invent fields', () => {
    expect(prompt).toContain('politely decline in one sentence');
    expect(prompt).toContain('Never invent fields');
  });

  it('puts the focus field first when one is given', () => {
    const focused = buildSystemPrompt(meta, 'priority');
    const focusAt = focused.indexOf('looking at this field right now');
    expect(focusAt).toBeGreaterThan(-1);
    expect(focused.indexOf('- Priority (priority')).toBeGreaterThan(focusAt);
    expect(focusAt).toBeLessThan(focused.indexOf('Ticket form fields:'));
  });

  it('has no focus section without a field', () => {
    expect(prompt).not.toContain('looking at this field right now');
  });
});
