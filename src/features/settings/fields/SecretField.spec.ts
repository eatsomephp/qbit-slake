import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SecretField from './SecretField.vue';

const mountField = (modelValue = 'hunter2') =>
  mount(SecretField, { props: { id: 'pw', modelValue } });

describe('SecretField', () => {
  it('is masked by default', () => {
    const w = mountField();
    expect(w.get('input').attributes('type')).toBe('password');
    expect((w.get('input').element as HTMLInputElement).value).toBe('hunter2');
  });

  it('reveals and re-masks with the toggle', async () => {
    const w = mountField();
    await w.get('button').trigger('click');
    expect(w.get('input').attributes('type')).toBe('text');
    await w.get('button').trigger('click');
    expect(w.get('input').attributes('type')).toBe('password');
  });

  it('emits typed values through v-model', async () => {
    const w = mountField();
    await w.get('input').setValue('new-secret');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['new-secret']);
  });

  it('disables the input and the toggle together', () => {
    const w = mount(SecretField, { props: { id: 'pw', modelValue: '', disabled: true } });
    expect(w.get('input').attributes('disabled')).toBeDefined();
    expect(w.get('button').attributes('disabled')).toBeDefined();
  });
});
