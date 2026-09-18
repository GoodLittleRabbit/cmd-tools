import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export type SpaceItem = { label: string; value: string };

type Props = {
  items: SpaceItem[];
  onSubmit: (selected: SpaceItem[]) => void;
};

export function SpaceMultiSelect({ items, onSubmit }: Props) {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c <= 0 ? items.length - 1 : c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => (c >= items.length - 1 ? 0 : c + 1));
      return;
    }
    if (input === ' ') {
      const value = items[cursor]?.value;
      if (!value) return;
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
      return;
    }
    if (input === 'a') {
      setPicked(new Set(items.map((i) => i.value)));
      return;
    }
    if (input === 'n') {
      setPicked(new Set());
      return;
    }
    if (key.return) {
      onSubmit(items.filter((i) => picked.has(i.value)));
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const active = i === cursor;
        const on = picked.has(item.value);
        return (
          <Text key={item.value} color={active ? 'cyan' : undefined}>
            {active ? '▸ ' : '  '}
            {on ? '✓ ' : '○ '}
            {item.label}
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>空格勾选 · a 全选 · n 清空 · 回车确认</Text>
      </Box>
    </Box>
  );
}
