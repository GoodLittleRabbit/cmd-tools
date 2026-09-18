import React, { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { Banner } from '../../ui/Banner.js';
import { SpaceMultiSelect } from '../../ui/SpaceMultiSelect.js';
import {
  loadConfig,
  resolveRemoteMap,
  type Server,
  type Service,
} from './config.js';

type Props = {
  dryRun?: boolean;
  serverId?: string;
  serviceIds?: string[];
  configPath?: string;
};

type Phase = 'server' | 'services' | 'confirm' | 'done' | 'error';

export function UploadServerApp({ dryRun = false, serverId, serviceIds, configPath }: Props) {
  const loaded = useMemo(() => {
    try {
      return { ok: true as const, data: loadConfig(configPath) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [configPath]);

  const [phase, setPhase] = useState<Phase>(() => {
    if (!loaded.ok) return 'error';
    if (serverId && serviceIds?.length) return 'confirm';
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
  const [message, setMessage] = useState('');

  if (!loaded.ok) {
    return (
      <Box flexDirection="column">
        <Banner title="upload-server" />
        <Text color="red">配置错误: {loaded.error}</Text>
      </Box>
    );
  }

  const { data } = loaded;
  const visibleServices = useMemo(() => {
    if (!server) return data.services;
    return data.services.filter((svc) => server.roles.includes(svc.kind));
  }, [data.services, server]);

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
    const plan = selected.map((svc) => {
      const remote =
        resolveRemoteMap(svc.remoteMap || svc.artifactOrMap, server.id) ?? '(未配置远端路径)';
      return { svc, remote };
    });

    return (
      <Box flexDirection="column">
        <Banner title="upload-server · 确认计划" />
        <Text>
          服务器: {server.label} · {server.user}@{server.host}
        </Text>
        <Text>CODE_ROOT: {data.codeRoot}</Text>
        <Text>配置: {data.configPath}</Text>
        {dryRun ? <Text color="yellow">模式: dry-run（不会实际上传）</Text> : null}
        <Box flexDirection="column" marginY={1}>
          <Text bold>将发版:</Text>
          {plan.map(({ svc, remote }) => (
            <Text key={svc.id}>
              - {svc.label} ({svc.kind}) → {remote}
              {svc.kind === 'web' ? `  build=${svc.buildOrShort}` : `  module=${svc.buildOrShort}`}
            </Text>
          ))}
        </Box>
        <SelectInput
          items={[
            {
              label: dryRun ? '打印计划并结束' : '确认执行（MVP：等同 dry-run 计划输出）',
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
            const lines = [
              '[cmd-tools upload-server] plan',
              `server=${server.id} ${server.user}@${server.host}`,
              ...plan.map(
                ({ svc, remote }) =>
                  `service=${svc.id} kind=${svc.kind} project=${data.codeRoot}/${svc.projectRel} remote=${remote}`,
              ),
              dryRun ? 'dry-run=true (no upload)' : 'mvp=true (upload hooks TODO; plan only)',
            ];
            setMessage(lines.join('\n'));
            setPhase('done');
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Banner title="upload-server" />
      <Text>{message || '完成'}</Text>
    </Box>
  );
}
