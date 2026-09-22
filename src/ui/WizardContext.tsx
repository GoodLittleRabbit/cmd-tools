import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';

export type WizardContextProps = {
  /** 已选服务器名；未选时不展示目标行 */
  serverName?: string;
  /** user@host[:port] */
  serverEndpoint?: string;
  /** 已选发版单元短名列表 */
  packages?: string[];
  /** 未选发版单元时的占位；传 false 则隐藏该行 */
  packagesPlaceholder?: string | false;
  /** 配置路径；传 false 隐藏 */
  configPath?: string | false;
  /** 多发版单元时折叠阈值，默认 3 */
  packageCollapseAt?: number;
};

function formatPackages(names: string[], collapseAt: number): string {
  if (!names.length) return '';
  if (names.length <= collapseAt) return names.join(' · ');
  const shown = names.slice(0, 2);
  return `${shown.join(' · ')} +${names.length - 2}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Box width={8}>
        <Text color={colors.muted}>{label}</Text>
      </Box>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
}

/**
 * 发版向导固定上下文：目标服务器 / 发版单元 / 配置。
 * 选服后每一屏顶住「发到哪、发什么」，避免只看步骤条不知道状态。
 */
export function WizardContext({
  serverName,
  serverEndpoint,
  packages = [],
  packagesPlaceholder = '尚未选择',
  configPath,
  packageCollapseAt = 3,
}: WizardContextProps) {
  const showPackages = packagesPlaceholder !== false;
  const showConfig = configPath !== false && Boolean(configPath);

  if (!serverName && !showPackages && !showConfig) return null;

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      paddingX={1}
      borderStyle="round"
      borderColor={colors.muted}
    >
      {serverName ? (
        <Row label="目标">
          <Text>
            <Text color={colors.accent} bold>
              {serverName}
            </Text>
            {serverEndpoint ? (
              <Text color={colors.muted}>  ·  {serverEndpoint}</Text>
            ) : null}
          </Text>
        </Row>
      ) : null}

      {showPackages ? (
        <Row label="发版单元">
          {packages.length ? (
            <Text color={colors.text}>{formatPackages(packages, packageCollapseAt)}</Text>
          ) : (
            <Text color={colors.muted}>{packagesPlaceholder}</Text>
          )}
        </Row>
      ) : null}

      {showConfig && typeof configPath === 'string' ? (
        <Row label="配置">
          <Text color={colors.muted}>{configPath}</Text>
        </Row>
      ) : null}
    </Box>
  );
}

/** 服务器连接串：user@host[:port] */
export function formatServerEndpoint(server: {
  user: string;
  host: string;
  port?: number;
}): string {
  const port = server.port && server.port !== 22 ? `:${server.port}` : '';
  return `${server.user}@${server.host}${port}`;
}
