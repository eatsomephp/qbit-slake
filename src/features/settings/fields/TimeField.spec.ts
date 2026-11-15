import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TimeField from './TimeField.vue';

const mountField = (hour = 8, minute = 5) =>
  mount(TimeField, { props: { id: 'from', hour, minute } });

const input = (w: ReturnType<typeof mountField>) => w.get<HTMLInputElement>('input');

describe('TimeField', () => {
  it('shows the time as zero-padded HH:MM', () => {
    expect(input(mountField(8, 5)).element.value).toBe('08:05');
    expect(input(mountField(0, 0)).element.value).toBe('00:00');
    expect(input(mountField(23, 59)).element.value).toBe('23:59');
  });

  it('updates both the hour and the minute when a time is typed', async () => {
    const w = mountField();
    await input(w).setValue('17:30');
    expect(w.emitted('update:hour')!.at(-1)).toEqual([17]);
    expect(w.emitted('update:minute')!.at(-1)).toEqual([30]);
  });

  it('leaves both values unchanged for input it cannot parse', async () => {
    const w = mountField();
    await input(w).setValue('not a time');
    await input(w).setValue('');
    expect(w.emitted('update:hour')).toBeUndefined();
    expect(w.emitted('update:minute')).toBeUndefined();
  });

  it('disables the input', () => {
    const w = mount(TimeField, { props: { id: 'from', hour: 1, minute: 2, disabled: true } });
    expect(input(w).attributes('disabled')).toBeDefined();
  });
});
