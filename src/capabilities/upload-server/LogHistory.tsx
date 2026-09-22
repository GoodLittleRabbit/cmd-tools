import fs from 'node:fs';
import { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  deployLogBodyLines,
  listDeployLogHistory,
  parseDeployLogMeta,
  summarizeDeployLog,
  type DeployLogEntry,
} from './deploy/logFile.js';
import { Banner } from '../../ui/Banner.js';
import { SelectList } from '../../ui/SelectList.js';
import { WizardContext } from '../../ui/WizardContext.js';
import { colors } from '../../ui/theme.js';

/** 首页「发版日志」：列表 → 详情（所选摘要 + 分隔 + 正文） */
export function LogHistory(props: { onHome: () => void }) {
  const [entries] = useState(() => listDeployLogHistory());
  const [selected, setSelected] = useState<DeployLogEntry | null>(null);
  const body = useMemo(() => {
    if (!selected) return '';
    try {
      return fs.readFileSync(selected.path, 'utf8');
    } catch {
      return '';
    }
  }, [selected]);

  if (selected) {
    return (
      <LogDetail entry={selected} body={body} onBack={() => setSelected(null)} onHome={props.onHome} />
    );
  }

  if (!entries.length) {
    return (
      <Box flexDirection="column">
        <Banner title="cmd-tools · 发版日志" />
        <Text color={colors.muted}>暂无历史。成功/失败发版后都会落盘。</Text>
        <Box marginTop={1}>
          <Text color={colors.muted}>← 回首页</Text>
        </Box>
        <EmptyBack onBack={props.onHome} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools · 发版日志" />
      <Text color={colors.muted}>共 {entries.length} 条 · Enter 查看 · ← 回首页</Text>
      <Box marginTop={1}>
        <SelectList
          canBack
          onBack={props.onHome}
          items={entries.map((e, i) => ({
            value: String(i),
            label: `${e.ok ? '✓' : '✗'}  ${e.stamp}`,
            hint: summarizeDeployLog(e.path),
          }))}
          onSubmit={(item) => {
            const e = entries[Number(item.value)];
            if (e) setSelected(e);
          }}
        />
      </Box>
    </Box>
  );
}

function EmptyBack({ onBack }: { onBack: () => void }) {
  useInput((_input, key) => {
    if (key.leftArrow || key.return) onBack();
  });
  return null;
}

function LogDetail(props: {
  entry: DeployLogEntry;
  body: string;
  onBack: () => void;
  onHome: () => void;
}) {
  const meta = useMemo(() => parseDeployLogMeta(props.body), [props.body]);
  const logLines = useMemo(() => deployLogBodyLines(props.body), [props.body]);
  const maxLines = 36;
  const shown = logLines.length > maxLines ? logLines.slice(-maxLines) : logLines;
  const clipped = logLines.length > maxLines;

  // server 字段形如 "prod · user@host" — 拆给上下文卡片
  const serverParts = meta.server?.split(/\s*·\s*/) ?? [];
  const serverName = serverParts[0]?.trim();
  const serverEndpoint = serverParts.slice(1).join(' · ').trim() || undefined;

  useInput((_input, key) => {
    if (key.leftArrow) props.onBack();
    if (key.escape) props.onHome();
  });

  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools · 发版日志" />

      <Box marginBottom={1}>
        <Text color={props.entry.ok ? colors.accent : colors.danger} bold>
          {props.entry.ok ? '✓ 成功' : '✗ 失败'}
        </Text>
        <Text color={colors.muted}>
          {'  '}
          {props.entry.stamp}
          {meta.mode === 'dry-run' ? '  ·  dry-run' : ''}
        </Text>
      </Box>

      <WizardContext
        serverName={serverName || '（未知服务器）'}
        serverEndpoint={serverEndpoint}
        packages={meta.packages}
        packagesPlaceholder={meta.packages.length ? undefined : '（未记录发版单元）'}
        configPath={meta.rootPath ?? false}
        packageCollapseAt={6}
      />

      <Box marginBottom={1}>
        <Text color={colors.muted}>{'─'.repeat(48)}</Text>
      </Box>

      {clipped ? (
        <Text color={colors.muted}>正文过长，仅显示末尾 {maxLines} 行 · 全文见文件</Text>
      ) : (
        <Text color={colors.muted}>过程日志</Text>
      )}

      <Box flexDirection="column" marginY={1}>
        {shown.length ? (
          shown.map((line, i) => (
            <Text key={i} color={colors.text}>
              {line || ' '}
            </Text>
          ))
        ) : (
          <Text color={colors.muted}>（无过程日志）</Text>
        )}
      </Box>

      <Text color={colors.muted}>{props.entry.path}</Text>
      <Text color={colors.muted}>← 回列表</Text>
    </Box>
  );
}
