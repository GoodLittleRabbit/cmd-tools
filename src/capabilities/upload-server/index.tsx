import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import { Banner } from '../../ui/Banner.js';
import { DeployProgress } from '../../ui/DeployProgress.js';
import { SpaceMultiSelect } from '../../ui/SpaceMultiSelect.js';
import {
  describeRemote,
  loadConfig,
  type Server,
  type Service,
} from './config.js';

type Props = {
  dryRun?: boolean;
  serverId?: string;
  serviceIds?: string[];
  configPath?: string;
};

type Phase = 'server' | 'services' | 'confirm' | 'deploy' | 'done' | 'error';

function selectionError(
  servers: Server[],
  services: Service[],
  serverId?: string,
  serviceIds?: string[],
): string | null {
  if (serverId) {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return `未知服务器 id: ${serverId}`;
    if (serviceIds?.length) {
      const unknown = serviceIds.filter((id) => !services.some((s) => s.id === id));
      if (unknown.length) return `未知服务 id: ${unknown.join(', ')}`;
      const mismatch = serviceIds.filter((id) => {
        const svc = services.find((s) => s.id === id);
        return svc ? !server.roles.includes(svc.kind) : false;
      });
      if (mismatch.length) {
        return `服务 ${mismatch.join(', ')} 与服务器角色 [${server.roles.join(',')}] 不匹配`;
      }
    }
  }
  return null;
}

function ExitFrame({ children, fail }: { children: React.ReactNode; fail?: boolean }) {
  const { exit } = useApp();
  useEffect(() => {
    if (fail) process.exitCode = 1;
    const t = setTimeout(() => exit(fail ? new Error('failed') : undefined), 40);
    return () => clearTimeout(t);
  }, [exit, fail]);
  return <>{children}</>;
}

export function UploadServerApp({ dryRun = false, serverId, serviceIds, configPath }: Props) {
  const loaded = useMemo(() => {
    try {
      return { ok: true as const, data: loadConfig(configPath) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [configPath]);

  const selectErr = loaded.ok
    ? selectionError(loaded.data.servers, loaded.data.services, serverId, serviceIds)
    : null;

  const [phase, setPhase] = useState<Phase>(() => {
    if (!loaded.ok || selectErr) return 'error';
    if (serverId && serviceIds?.length) return 'deploy';
    if (serverId) return 'services';
    return 'server';
  });
  const [server, setServer] = useState<Server | null>(() => {
    if (!loaded.ok || !serverId) return null;
    return loaded.data.servers.find((s) => s.id === serverId) ?? null;
  });
  const [selected, setSelected] = useState<Service[]>(() => {
    if (!loaded.ok || !serviceIds?.length) return [];
    return loaded.data.services.filter((s) => serviceIds.includes(s.id));
  });
  const [message, setMessage] = useState(selectErr ?? '');

  const visibleServices = useMemo(() => {
    if (!loaded.ok) return [];
    if (!server) return loaded.data.services;
    return loaded.data.services.filter((svc) => server.roles.includes(svc.kind));
  }, [loaded, server]);

  if (!loaded.ok) {
    return (
      <ExitFrame fail>
        <Box flexDirection="column">
          <Banner title="upload-server" />
          <Text color="red">配置错误: {loaded.error}</Text>
        </Box>
      </ExitFrame>
    );
  }

  if (phase === 'error') {
    return (
      <ExitFrame fail>
        <Box flexDirection="column">
          <Banner title="upload-server" />
          <Text color="red">{message || '参数错误'}</Text>
        </Box>
      </ExitFrame>
    );
  }

  const { data } = loaded;

  if (phase === 'server') {
    return (
      <Box flexDirection="column">
        <Banner title="upload-server · 选择服务器" />
        <Text dimColor>↑↓ 移动，回车确认 {dryRun ? '(dry-run)' : ''}</Text>
        <SelectInput
          items={data.servers.map((s) => ({
            label: `${s.label}  ·  ${s.user}@${s.host}  ·  [${s.roles.join(',')}]`,
            value: s.id,
          }))}
          onSelect={(item) => {
            const s = data.servers.find((x) => x.id === item.value)!;
            setServer(s);
            setPhase('services');
          }}
        />
      </Box>
    );
  }

  if (phase === 'services' && server) {
    return (
      <Box flexDirection="column">
        <Banner title="upload-server · 选择服务" />
        <Text>
          服务器: <Text color="cyan">{server.label}</Text> ({server.host})
        </Text>
        <SpaceMultiSelect
          items={visibleServices.map((s) => ({
            label: `${s.label}  ·  ${s.id}  ·  ${s.kind}`,
            value: s.id,
          }))}
          onSubmit={(items) => {
            const picked = visibleServices.filter((s) => items.some((i) => i.value === s.id));
            if (!picked.length) {
              setMessage('至少选一个服务');
              return;
            }
            setSelected(picked);
            setMessage('');
            setPhase('confirm');
          }}
        />
        {message ? <Text color="yellow">{message}</Text> : null}
      </Box>
    );
  }

  if (phase === 'confirm' && server) {
    return (
      <Box flexDirection="column">
        <Banner title="upload-server · 确认计划" />
        <Text>
          服务器: {server.label} · {server.user}@{server.host}
        </Text>
        <Text>CODE_ROOT: {data.codeRoot}</Text>
        <Text>配置: {data.configPath}</Text>
        {data.demo ? (
          <Text color="yellow">正在使用包内 example.conf（只读演示）。请复制到 ./config 或 ~/.config/cmd-tools/</Text>
        ) : null}
        {dryRun ? <Text color="yellow">模式: dry-run（跳过重构建 / scp / ssh）</Text> : null}
        <Box flexDirection="column" marginY={1}>
          <Text bold>将发版:</Text>
          {selected.map((svc) => (
            <Text key={svc.id}>
              - {svc.label} ({svc.kind}) → {describeRemote(svc, server.id)}
              {svc.kind === 'web'
                ? `  build=${svc.buildCommand}`
                : `  jar=${svc.jarRel}`}
            </Text>
          ))}
        </Box>
        <SelectInput
          items={[
            {
              label: dryRun ? '开始演练（dry-run）' : '确认执行发版',
              value: 'go',
            },
            { label: '取消', value: 'cancel' },
          ]}
          onSelect={(item) => {
            if (item.value === 'cancel') {
              setMessage('已取消');
              setPhase('done');
              return;
            }
            setPhase('deploy');
          }}
        />
      </Box>
    );
  }

  if (phase === 'deploy' && server && selected.length) {
    return (
      <DeployProgress
        codeRoot={data.codeRoot}
        server={server}
        services={selected}
        dryRun={dryRun}
        configPath={data.configPath}
        demo={data.demo}
      />
    );
  }

  return (
    <ExitFrame>
      <Box flexDirection="column">
        <Banner title="upload-server" />
        <Text>{message || '完成'}</Text>
      </Box>
    </ExitFrame>
  );
}
