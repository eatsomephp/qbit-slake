import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ScanDirsField from './ScanDirsField.vue';
import type { ScanDirs } from './scanDirs';

function mountField(initial: ScanDirs) {
  return mount(ScanDirsField, {
    props: {
      id: 'scan',
      modelValue: initial,
      'onUpdate:modelValue': (dirs: ScanDirs) => w.setProps({ modelValue: dirs }),
    },
  });
}
let w: ReturnType<typeof mountField>;

const lastEmitted = () => w.emitted('update:modelValue')!.at(-1)![0];
const addButton = () => w.findAll('button').find((b) => b.text().includes('Add folder'))!;
const folderInputs = () => w.findAll('input[aria-label="Watched folder"]');
const targetSelects = () => w.findAll('select');
const removeButtons = () => w.findAll('button[aria-label="Remove watched folder"]');

describe('ScanDirsField', () => {
  it('shows one row per existing entry', () => {
    w = mountField({ '/a': 0, '/b': '/save' });
    expect(folderInputs().map((i) => (i.element as HTMLInputElement).value)).toEqual(['/a', '/b']);
    expect(targetSelects().map((s) => (s.element as HTMLSelectElement).value)).toEqual([
      'watched',
      'custom',
    ]);
    expect(w.find('input[aria-label="Custom save path"]').exists()).toBe(true);
  });

  it('emits the dict once a folder is added and named', async () => {
    w = mountField({});
    await addButton().trigger('click');
    expect(w.emitted('update:modelValue')).toBeUndefined();
    await folderInputs()[0]!.setValue('/watch');
    expect(lastEmitted()).toEqual({ '/watch': 0 });
  });

  it('switches a row to a custom path and emits it once typed', async () => {
    w = mountField({ '/a': 0 });
    await targetSelects()[0]!.setValue('custom');
    expect(lastEmitted()).toEqual({ '/a': 1 });
    await w.get('input[aria-label="Custom save path"]').setValue('/dest');
    expect(lastEmitted()).toEqual({ '/a': '/dest' });
  });

  it('switches a row to the default path', async () => {
    w = mountField({ '/a': 0 });
    await targetSelects()[0]!.setValue('default');
    expect(lastEmitted()).toEqual({ '/a': 1 });
  });

  it('removes a row', async () => {
    w = mountField({ '/a': 0, '/b': 1 });
    await removeButtons()[0]!.trigger('click');
    expect(lastEmitted()).toEqual({ '/b': 1 });
    expect(folderInputs()).toHaveLength(1);
  });

  it('rebuilds its rows when the model changes from outside', async () => {
    w = mountField({ '/a': 0 });
    await folderInputs()[0]!.setValue('/edited');
    await w.setProps({ modelValue: { '/a': 0, '/z': '/zsave' } });
    expect(folderInputs().map((i) => (i.element as HTMLInputElement).value)).toEqual(['/a', '/z']);
    expect(w.get('input[aria-label="Custom save path"]').element).toHaveProperty('value', '/zsave');
  });

  it('keeps an unfinished blank row when the model echoes back unchanged', async () => {
    w = mountField({ '/a': 0 });
    await addButton().trigger('click');
    await w.setProps({ modelValue: { '/a': 0 } });
    expect(folderInputs()).toHaveLength(2);
  });

  it('disables every control', () => {
    w = mount(ScanDirsField, { props: { id: 's', modelValue: { '/a': 0 }, disabled: true } });
    expect(w.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    expect(w.get('input').attributes('disabled')).toBeDefined();
  });
});
