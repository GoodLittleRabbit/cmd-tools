import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';

export type WizardStep = { id: string; label: string };

export const UPLOAD_STEPS: WizardStep[] = [
  { id: 'server', label: '服务器' },
  { id: 'packages', label: '发版单元' },
  { id: 'confirm', label: '确认' },
  { id: 'deploy', label: '发版' },
];

/**
 * 短步骤条：当前 ● 加粗，已过 ✓，未到 ○。
 * 仅发版中显示已用时，不常驻时钟以免抢注意力。
 */
export function WizardHeader({
  current,
  startedAt,
}: {
  current: string;
  /** 发版开始时间戳，有则显示已用时 */
  startedAt?: number;
}) {
  const idx = Math.max(0, UPLOAD_STEPS.findIndex((s) => s.id === current));
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      setElapsed(m > 0 ? `${m}分${r}秒` : `${r}秒`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        {UPLOAD_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = i < idx;
          const color = active ? colors.accent : done ? colors.pink : colors.muted;
          const mark = active ? '●' : done ? '✓' : '○';
          return (
            <Box key={s.id}>
              {i > 0 ? <Text color={colors.muted}> · </Text> : null}
              <Text color={color} bold={active}>
                {mark} {s.label}
              </Text>
            </Box>
          );
        })}
        {elapsed ? (
          <Text color={colors.muted}>
            {'  '}·  已用 {elapsed}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
