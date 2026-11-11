import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from './theme.js';
import { useListWindow } from './use-list-window.js';

export type CheckItem = { name: string; label?: string };

export function CheckList({
  items,
  onSubmit,
  onBack,
  canBack = false,
  isActive = true,
  reservedRows,
}: {
  items: CheckItem[];
  onSubmit: (names: string[]) => void;
  onBack?: () => void;
  canBack?: boolean;
  isActive?: boolean;
  reservedRows?: number;
}) {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const allowBack = canBack && Boolean(onBack);
  const win = useListWindow(cursor, items.length, reservedRows);

  useInput(
    (input, key) => {
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
      if (input === 'a' || input === 'A') {
        setPicked(new Set(items.map((it) => it.name)));
        return;
      }
      if (input === 'c' || input === 'C') {
        setPicked(new Set());
        return;
      }
      if (input === ' ') {
        const cur = items[cursor];
        if (!cur) return;
        setPicked((prev) => {
          const next = new Set(prev);
          if (next.has(cur.name)) next.delete(cur.name);
          else next.add(cur.name);
          return next;
        });
        return;
      }
      if (key.return) onSubmit([...picked]);
    },
    { isActive },
  );

  const visible = items.slice(win.start, win.end);
  return (
    <Box flexDirection="column">
      {win.moreAbove ? (
        <Text color={colors.muted}>{`  ↑ 还有 ${win.start} 项`}</Text>
      ) : null}
      {visible.map((item, offset) => {
        const i = win.start + offset;
        const active = i === cursor;
        const on = picked.has(item.name);
        return (
          <Box key={item.name} marginBottom={1}>
            <Text color={active ? colors.accent : colors.text} bold={active}>
              {active ? '❯ ' : '  '}
              {on ? '◉' : '○'} {item.label ?? item.name}
            </Text>
          </Box>
        );
      })}
      {win.moreBelow ? (
        <Text color={colors.muted}>{`  ↓ 还有 ${items.length - win.end} 项`}</Text>
      ) : null}
      <Box marginTop={1}>
        <Text color={colors.muted}>
          {allowBack
            ? '空格勾选 · a 全选 · c 清空 · Enter 继续 · ← 返回 · 已选 '
            : '空格勾选 · a 全选 · c 清空 · Enter 继续 · 已选 '}
        </Text>
        <Text color={colors.pink}>{picked.size}</Text>
      </Box>
    </Box>
  );
}
