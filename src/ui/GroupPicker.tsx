import { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from './theme.js';

export type GroupItem = {
  name: string;
  packages: { name: string; label?: string }[];
};

function markFor(selected: number, total: number): string {
  if (total === 0 || selected === 0) return '○';
  if (selected >= total) return '◉';
  return '◐';
}

export function GroupPicker({
  groups,
  onSubmit,
  onBack,
  canBack = false,
  isActive = true,
}: {
  groups: GroupItem[];
  onSubmit: (packageNames: string[]) => void;
  onBack?: () => void;
  canBack?: boolean;
  isActive?: boolean;
}) {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [drill, setDrill] = useState<string | null>(null);
  const [subCursor, setSubCursor] = useState(0);
  const allowListBack = canBack && Boolean(onBack);

  const drillGroup = useMemo(
    () => (drill ? groups.find((g) => g.name === drill) ?? null : null),
    [drill, groups],
  );

  const allNames = useMemo(
    () => groups.flatMap((g) => g.packages.map((p) => p.name)),
    [groups],
  );

  useInput(
    (input, key) => {
      if (drillGroup) {
        const pkgs = drillGroup.packages;
        if (key.leftArrow) {
          setDrill(null);
          setSubCursor(0);
          return;
        }
        if (key.upArrow) {
          setSubCursor((c) => (c <= 0 ? pkgs.length - 1 : c - 1));
          return;
        }
        if (key.downArrow) {
          setSubCursor((c) => (c >= pkgs.length - 1 ? 0 : c + 1));
          return;
        }
        if (input === ' ') {
          const cur = pkgs[subCursor];
          if (!cur) return;
          setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(cur.name)) next.delete(cur.name);
            else next.add(cur.name);
            return next;
          });
          return;
        }
        // 子项页 Enter：确认并进入下一步；← 才回分组
        if (key.return) {
          onSubmit([...picked]);
        }
        return;
      }

      if (key.leftArrow && allowListBack) {
        onBack!();
        return;
      }
      if (key.upArrow) {
        setCursor((c) => (c <= 0 ? groups.length - 1 : c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => (c >= groups.length - 1 ? 0 : c + 1));
        return;
      }
      if (key.rightArrow) {
        const g = groups[cursor];
        if (!g) return;
        setDrill(g.name);
        setSubCursor(0);
        return;
      }
      // a = 全选所有 package；c = 清空
      if (input === 'a' || input === 'A') {
        setPicked(new Set(allNames));
        return;
      }
      if (input === 'c' || input === 'C') {
        setPicked(new Set());
        return;
      }
      if (input === ' ') {
        const g = groups[cursor];
        if (!g) return;
        const names = g.packages.map((p) => p.name);
        setPicked((prev) => {
          const next = new Set(prev);
          const sel = names.filter((n) => next.has(n)).length;
          // ○ → 全选；◉ → 清空；◐ → 清空（半选一键清空）
          if (sel === 0) for (const n of names) next.add(n);
          else for (const n of names) next.delete(n);
          return next;
        });
        return;
      }
      if (key.return) {
        onSubmit([...picked]);
      }
    },
    { isActive },
  );

  if (drillGroup) {
    const pkgs = drillGroup.packages;
    return (
      <Box flexDirection="column">
        <Text color={colors.accent}>{drillGroup.name}</Text>
        <Box marginTop={1} flexDirection="column">
          {pkgs.map((p, i) => {
            const active = i === subCursor;
            const on = picked.has(p.name);
            return (
              <Box key={p.name}>
                <Text color={active ? colors.accent : colors.text} bold={active}>
                  {active ? '❯ ' : '  '}
                  {on ? '◉' : '○'} {p.label ?? p.name}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text color={colors.muted}>空格勾选 · Enter 下一步 · ← 返回 · 已选 </Text>
          <Text color={colors.pink}>{picked.size}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {groups.map((g, i) => {
        const active = i === cursor;
        const sel = g.packages.filter((p) => picked.has(p.name)).length;
        const m = markFor(sel, g.packages.length);
        return (
          <Box key={g.name}>
            <Text color={active ? colors.accent : colors.text} bold={active}>
              {active ? '❯ ' : '  '}
              {m} {g.name}
            </Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={colors.muted}>
          {allowListBack
            ? '空格整组 · → 子项 · a 全选 · c 清空 · Enter 确认 · ← 返回 · 已选 '
            : '空格整组 · → 子项 · a 全选 · c 清空 · Enter 确认 · 已选 '}
        </Text>
        <Text color={colors.pink}>{picked.size}</Text>
      </Box>
    </Box>
  );
}
