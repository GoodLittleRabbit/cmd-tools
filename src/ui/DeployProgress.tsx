import React, { useEffect, useMemo, useReducer } from 'react';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import type { Server, Service } from '../capabilities/upload-server/config.js';
import { runDeploy } from '../capabilities/upload-server/deploy/run.js';
import { sleep } from '../capabilities/upload-server/deploy/exec.js';
import {
  DEPLOY_STEPS,
  type DeployEvent,
  type StepId,
  type StepStatus,
} from '../capabilities/upload-server/deploy/types.js';
import { Banner } from './Banner.js';
import { ProgressBar } from './ProgressBar.js';

const STEP_LABEL: Record<StepId, string> = {
  build: '构建',
  pack: '打包',
  upload: '上传',
  remote: '远端',
};

const LOG_LINES = 8;

type ServiceUi = {
  id: string;
  label: string;
  kind: 'web' | 'api';
  steps: Record<StepId, StepStatus>;
  dryRun: boolean;
  result: 'pending' | 'running' | 'done' | 'fail';
  error?: string;
};

type State = {
  currentIndex: number;
  total: number;
  services: ServiceUi[];
  logs: string[];
  finished: boolean;
  ok: boolean;
};

function initState(services: Service[]): State {
  return {
    currentIndex: 0,
    total: services.length,
    services: services.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      steps: { build: 'pending', pack: 'pending', upload: 'pending', remote: 'pending' },
      dryRun: false,
      result: 'pending',
    })),
    logs: [],
    finished: false,
    ok: true,
  };
}

function reducer(state: State, ev: DeployEvent): State {
  switch (ev.type) {
    case 'log':
      return { ...state, logs: [...state.logs, ev.line].slice(-LOG_LINES) };
    case 'service-start':
      return {
        ...state,
        currentIndex: ev.index,
        total: ev.total,
        services: state.services.map((s) => (s.id === ev.serviceId ? { ...s, result: 'running' } : s)),
      };
    case 'step':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === ev.serviceId
            ? {
                ...s,
                dryRun: ev.dryRun ?? s.dryRun,
                steps: { ...s.steps, [ev.step]: ev.status },
              }
            : s,
        ),
      };
    case 'service-done':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === ev.serviceId ? { ...s, result: ev.ok ? 'done' : 'fail', error: ev.error } : s,
        ),
      };
    case 'done':
      return { ...state, finished: true, ok: ev.ok };
    default:
      return state;
  }
}

function stepColor(status: StepStatus): string | undefined {
  switch (status) {
    case 'running':
      return 'cyan';
    case 'done':
      return 'green';
    case 'fail':
      return 'red';
    default:
      return undefined;
  }
}

function StepMark({ status }: { status: StepStatus }) {
  if (status === 'running') {
    return (
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
    );
  }
  if (status === 'done') return <Text color="green">✓</Text>;
  if (status === 'fail') return <Text color="red">✗</Text>;
  return <Text dimColor>○</Text>;
}

type Props = {
  codeRoot: string;
  server: Server;
  services: Service[];
  dryRun: boolean;
  configPath?: string;
  demo?: boolean;
};

export function DeployProgress({ codeRoot, server, services, dryRun, configPath, demo }: Props) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, services, initState);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await runDeploy({
        codeRoot,
        server,
        services,
        dryRun,
        emit: (ev) => {
          if (!cancelled) dispatch(ev);
        },
      });
      await sleep(120);
      if (!cancelled) {
        if (!ok) process.exitCode = 1;
        exit(ok ? undefined : new Error('deploy failed'));
      }
    })();
    return () => {
      cancelled = true;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = useMemo(() => {
    const total = state.services.length * DEPLOY_STEPS.length;
    if (total === 0) return 0;
    let acc = 0;
    for (const s of state.services) {
      for (const id of DEPLOY_STEPS) {
        const st = s.steps[id];
        if (st === 'done' || st === 'fail') acc += 1;
        else if (st === 'running') acc += 0.4;
      }
    }
    return acc / total;
  }, [state.services]);

  const current = state.services[Math.min(state.currentIndex, Math.max(0, state.services.length - 1))];
  const barColor = state.finished ? (state.ok ? 'green' : 'red') : 'cyan';
  const title = state.finished
    ? state.ok
      ? 'upload-server · 完成'
      : 'upload-server · 失败'
    : 'upload-server · 发版中';

  const paddedLogs = Array.from({ length: LOG_LINES }, (_, i) => {
    const offset = state.logs.length - LOG_LINES;
    return state.logs[offset + i] ?? '';
  });

  const succeeded = state.services.filter((s) => s.result === 'done').length;

  return (
    <Box flexDirection="column">
      <Banner title={title} />
      <Text>
        服务器: <Text color="cyan">{server.label}</Text>  {server.user}@{server.host}
      </Text>
      {configPath ? <Text dimColor>配置: {configPath}</Text> : null}
      {demo ? (
        <Text color="yellow">正在使用包内 example.conf（只读演示）。请复制到 ./config 或 ~/.config/cmd-tools/</Text>
      ) : null}
      {dryRun ? (
        <Text color="yellow">模式: dry-run  ·  不执行 scp / ssh，跳过重构建</Text>
      ) : (
        <Text color="green">模式: 真实发版</Text>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text>
          总进度{' '}
          <Text color="cyan" bold>
            {state.total === 0 ? '0/0' : `${Math.min(state.currentIndex + 1, state.total)}/${state.total}`}
          </Text>
          {current ? (
            <Text>
              {' '}
              · {current.label} <Text dimColor>({current.id})</Text>
            </Text>
          ) : null}
        </Text>
        <ProgressBar value={state.finished && state.ok ? 1 : progress} color={barColor} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {state.services.map((s) => {
          const active = s.result === 'running';
          const nameColor =
            s.result === 'fail' ? 'red' : s.result === 'done' ? 'green' : active ? 'cyan' : undefined;
          return (
            <Box key={s.id} flexDirection="column">
              <Text color={nameColor} bold={active}>
                {active ? '▸ ' : '  '}
                {s.label}{' '}
                <Text dimColor>
                  · {s.id} · {s.kind}
                </Text>
              </Text>
              <Box paddingLeft={4}>
                {DEPLOY_STEPS.map((id) => (
                  <Box key={id} marginRight={3}>
                    <StepMark status={s.steps[id]} />
                    <Text color={stepColor(s.steps[id])}> {STEP_LABEL[id]}</Text>
                    {s.dryRun && s.steps[id] !== 'pending' ? <Text color="yellow"> [dry-run]</Text> : null}
                  </Box>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>log</Text>
        {paddedLogs.map((line, i) => (
          <Text key={i} dimColor wrap="truncate">
            {line || ' '}
          </Text>
        ))}
      </Box>

      {state.finished ? (
        <Box marginTop={1} flexDirection="column">
          {state.ok ? (
            <Text color="green" bold>
              ✓ 发版完成  {succeeded}/{state.total} 服务成功
            </Text>
          ) : (
            <Text color="red" bold>
              ✗ 发版失败  {succeeded}/{state.total} 成功后中止
            </Text>
          )}
          {state.services.map((s) => (
            <Text
              key={s.id}
              color={s.result === 'fail' ? 'red' : s.result === 'done' ? 'green' : 'gray'}
            >
              {s.result === 'fail' ? '  ✗ ' : s.result === 'done' ? '  ✓ ' : '  ○ '}
              {s.label}
              {s.error ? ` — ${s.error}` : ''}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
