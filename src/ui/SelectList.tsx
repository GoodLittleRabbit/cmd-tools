import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from './theme.js';

export type SelectItem = { label: string; value: string; hint?: string };

export function SelectList({
  items,
  onSubmit,
  onBack,
  canBack = false,
  isActive = true,
}: {
  items: SelectItem[];
  onSubmit: (item: SelectItem) => void;
  /** 仅当 canBack 为 true 时 ← 会触发 */
  onBack?: () => void;
  canBack?: boolean;
  isActive?: boolean;
}) {
  const [cursor, setCursor] = useState(0);
  const allowBack = canBack && Boolean(onBack);

  useInput(
    (_input, key) => {
      if (key.leftArrow && allowBack) {
        onBack!();
        return;
      }
      if (key.upArrow) {
        setCursor((c) => (c <= 0 ? items.length - 1 : c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => (c >= items.length - 1 ? 0 : c + 1));
        return;
      }
      if (key.return) {
        const item = items[cursor];
        if (item) onSubmit(item);
      }
    },
    { isActive },
  );

  const footer = allowBack
    ? '↑↓ 移动 · Enter 确认 · ← 返回'
    : '↑↓ 移动 · Enter 确认';

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const active = i === cursor;
        return (
          <Box key={item.value}>
            <Text color={active ? colors.accent : colors.text} bold={active}>
              {active ? '❯ ' : '  '}
              {item.label}
            </Text>
            {item.hint ? <Text color={colors.muted}>{`  ${item.hint}`}</Text> : null}
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={colors.muted}>{footer}</Text>
      </Box>
    </Box>
  );
}
