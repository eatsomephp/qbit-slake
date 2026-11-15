import type { Component } from 'vue';

export interface SegmentedOption<Value> {
  value: Value;
  label: string;
  icon?: Component;
  tooltip?: string;
  dimmed?: boolean;
}
