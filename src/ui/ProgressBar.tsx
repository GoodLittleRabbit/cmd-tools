import React from 'react';
import { Text } from 'ink';

type Props = {
  value: number;
  width?: number;
  color?: string;
};

export function ProgressBar({ value, width = 32, color = 'cyan' }: Props) {
  const ratio = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  const pct = String(Math.round(ratio * 100)).padStart(3, ' ');
  return (
    <Text>
      <Text color="gray">[</Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text color="gray">]</Text>
      <Text color={color}> {pct}%</Text>
    </Text>
  );
}
