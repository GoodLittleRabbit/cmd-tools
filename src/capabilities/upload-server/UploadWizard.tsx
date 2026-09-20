import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  describeDest,
  loadConfig,
  type LoadedConfig,
  type Package,
  type Server,
} from './config.js';
import { resolvePackageBuild } from './detect.js';
import { runDeploy } from './deploy/run.js';
import { openDeployLogFile } from './deploy/logFile.js';
import { packageTitle } from './display.js';
import { aiSetupGuide } from './init.js';
import { Banner } from '../../ui/Banner.js';
import { SelectList } from '../../ui/SelectList.js';
import { GroupPicker } from '../../ui/GroupPicker.js';
import { WizardHeader } from '../../ui/WizardHeader.js';
import { colors } from '../../ui/theme.js';

type Step = 'server' | 'packages' | 'confirm' | 'deploy' | 'done';

export function UploadWizard(props: {
  dryRun?: boolean;
  serverName?: string;
  packageNames?: string[];
  configPath?: string;
  /** 发版结束后回首页（从 App 进入时传入）；无则退出进程 */
  onHome?: () => void;
}) {
  const { exit } = useApp();
  const dryRun = Boolean(props.dryRun);
  /** CLI 指定了 --server 时，组件页不能 ← 回服务器列表 */
  const serverLocked = Boolean(props.serverName);
  const goHome = () => {
    if (props.onHome) props.onHome();
    else exit();
  };

  const [config] = useState<LoadedConfig>(() => loadConfig(props.configPath));

  const [step, setStep] = useState<Step>(() => {
    if (props.serverName && props.packageNames?.length) return 'confirm';
    if (props.serverName) return 'packages';
    return 'server';
  });
  const [server, setServer] = useState<Server | null>(() =>
    props.serverName
      ? (config.servers.find((s) => s.name === props.serverName) ?? null)
      : null,
  );
  const [packages, setPackages] = useState<Package[]>(() =>
    props.packageNames?.length
      ? config.packages.filter((p) => props.packageNames!.includes(p.name))
      : [],
  );
  const [logPath, setLogPath] = useState('');
  const [deployStartedAt, setDeployStartedAt] = useState<number | undefined>();
  const [status, setStatus] = useState('');
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0, pkg: '', step: '' });
  /** Bump on every step change so lists remount clean (fresh useInput). */
  const [navEpoch, setNavEpoch] = useState(0);

  function go(next: Step) {
    setStatus('');
    setNavEpoch((n) => n + 1);
    setStep(next);
  }

  /** 发版成功后「继续发版」：有首页则回首页重选；否则重置向导再选 */
  const continueDeploy = () => {
    if (props.onHome) {
      props.onHome();
      return;
    }
    setServer(
      props.serverName
        ? (config.servers.find((s) => s.name === props.serverName) ?? null)
        : null,
    );
    setPackages(
      props.packageNames?.length
        ? config.packages.filter((p) => props.packageNames!.includes(p.name))
        : [],
    );
    setStatus('');
    setOk(true);
    setLogPath('');
    setDeployStartedAt(undefined);
    setBusy(false);
    setProgress({ index: 0, total: 0, pkg: '', step: '' });
    if (props.serverName && props.packageNames?.length) go('confirm');
    else if (props.serverName) go('packages');
    else go('server');
  };


  const confirmActions = useMemo(
    () => [
      dryRun ? '开始演练' : '确认发版',
      '返回 · 重选组件',
      '返回 · 重选服务器',
      props.onHome ? '回首页' : '退出',
    ],
    [dryRun, props.onHome],
  );

  async function startDeploy() {
    if (!server || !packages.length) return;
    setNavEpoch((n) => n + 1);
    setStep('deploy');
    setBusy(true);
    setLogPath('');
    setDeployStartedAt(Date.now());
    setProgress({ index: 0, total: packages.length, pkg: '', step: '' });
    const stepLabel: Record<string, string> = {
      build: '构建',
      pack: '打包',
      upload: '上传',
      remote: '远端',
      after: '收尾',
    };
    const logFile = openDeployLogFile('upload-server');
    logFile.append(`server ${server.name} · ${server.user}@${server.host}`);
    logFile.append(`packages ${packages.map((x) => x.name).join(', ')}`);
    logFile.append(dryRun ? 'mode=dry-run' : 'mode=real');

    const success = await runDeploy({
      rootPath: config.rootPath,
      server,
      packages,
      dryRun,
      emit: (ev) => {
        if (ev.type === 'log') {
          logFile.append(ev.line);
          const m = ev.line.match(/^正在：(.+?)（/);
          if (m) setProgress((p) => ({ ...p, step: m[1]! }));
        }
        if (ev.type === 'pkg-start') {
          setProgress({
            index: ev.index,
            total: ev.total,
            pkg: ev.label || ev.packageId,
            step: '',
          });
          logFile.append(`(${ev.index + 1}/${ev.total}) ${ev.label || ev.packageId}`);
        }
        if (ev.type === 'step') {
          const zh = stepLabel[ev.step] || ev.step;
          setProgress((p) => ({ ...p, pkg: ev.packageId, step: `${zh}·${ev.status}` }));
          logFile.append(`  ${ev.packageId} · ${zh} · ${ev.status}`);
        }
        if (ev.type === 'pkg-done') {
          setProgress((p) => ({
            ...p,
            index: Math.min(p.index + 1, p.total),
            step: ev.ok ? '完成' : '失败',
          }));
          logFile.append(
            ev.ok ? `  ✓ ${ev.packageId}` : `  ✗ ${ev.packageId}${ev.error ? ' — ' + ev.error : ''}`,
          );
        }
        if (ev.type === 'done') {
          logFile.append(ev.ok ? 'DONE' : 'FAIL');
        }
      },
    });
    const kept = logFile.finish(success);
    setLogPath(kept ?? '');
    setOk(success);
    setStatus(success ? (dryRun ? 'dry-run 完成' : '发版完成') : '发版失败');
    setBusy(false);
    setStep('done');
  }

  const configEmpty = config.packages.length === 0 || config.servers.length === 0;

  useInput(
    (_input, key) => {
      if (!configEmpty) return;
      if (key.leftArrow && props.onHome) props.onHome();
    },
    { isActive: configEmpty },
  );

  if (configEmpty) {
    const guide = aiSetupGuide(config.configPath);
    return (
      <Box flexDirection="column">
        <Banner title="cmd-tools · upload-server" subtitle={dryRun ? 'dry-run' : undefined} />
        <Box flexDirection="column" marginBottom={1}>
          {guide.map((line, i) => (
            <Text key={i} color={line.startsWith('给 AI') ? colors.accent : undefined}>
              {line || ' '}
            </Text>
          ))}
        </Box>
        {props.onHome ? (
          <Text color={colors.muted}>按 ← 回首页</Text>
        ) : (
          <Text color={colors.muted}>Ctrl+C 退出</Text>
        )}
      </Box>
    );
  }

  if (step === 'server') {
    return (
      <Box flexDirection="column">
        <Banner title="cmd-tools · upload-server" subtitle={dryRun ? 'dry-run' : undefined} />
        <WizardHeader current="server" />
        <Text color={colors.muted}>配置 {config.configPath}</Text>
        <Box marginTop={1}>
          <SelectList
            key={`server-${navEpoch}`}
            canBack={Boolean(props.onHome)}
            onBack={props.onHome ? goHome : undefined}
            items={config.servers.map((s) => ({
              value: s.name,
              label: s.name,
              hint: `${s.user}@${s.host}${s.port && s.port !== 22 ? ':' + s.port : ''}`,
            }))}
            onSubmit={(item) => {
              const s = config.servers.find((x) => x.name === item.value)!;
              setServer(s);
              setPackages([]);
              go('packages');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'packages' && server) {
    return (
      <Box flexDirection="column">
        <Banner title="cmd-tools · upload-server" />
        <WizardHeader current="packages" />
        <Text color={colors.accent}>
          服务器 {server.name} · {server.user}@{server.host}
        </Text>
        <Box marginTop={1}>
          <GroupPicker
            key={`packages-${navEpoch}`}
            canBack={!serverLocked || Boolean(props.onHome)}
            onBack={() => {
              if (serverLocked) goHome();
              else go('server');
            }}
            groups={config.groups.map((g) => ({
              name: g.name,
              packages: g.packages.map((pkg) => ({ name: pkg.name })),
            }))}
            onSubmit={(names) => {
              if (!names.length) {
                setStatus('请至少勾选一个 package');
                return;
              }
              const want = new Set(names);
              const selected = config.packages.filter((pkg) => want.has(pkg.name));
              setPackages(selected);
              go('confirm');
            }}
          />
        </Box>
        {status ? (
          <Box marginTop={1}>
            <Text color={colors.danger}>{status}</Text>
          </Box>
        ) : null}
      </Box>
    );
  }

  if (step === 'confirm' && server && packages.length) {
    return (
      <ConfirmStep
        key={`confirm-${navEpoch}`}
        dryRun={dryRun}
        config={config}
        server={server}
        packages={packages}
        actions={confirmActions}
        onBack={() => go('packages')}
        onAction={(i) => {
          if (i === 0) void startDeploy();
          else if (i === 1) go('packages');
          else if (i === 2) go('server');
          else goHome();
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools · upload-server" />
      <WizardHeader current="deploy" startedAt={deployStartedAt} />
      {busy ? (
        <Text color={colors.pink}>
          <Spinner type="dots" /> {dryRun ? '演练中…' : '发版中…'}
          {progress.pkg ? `  ${progress.pkg}` : ''}
          {progress.step ? `  · ${progress.step}` : ''}
          {progress.total > 0
            ? `  (${Math.min(progress.index, progress.total)}/${progress.total})`
            : ''}
        </Text>
      ) : (
        <Box flexDirection="column">
          <Text color={ok ? colors.accent : colors.danger}>{status}</Text>
          {!ok && logPath ? (
            <Box marginTop={1}>
              <Text color={colors.muted}>失败日志 {logPath}</Text>
            </Box>
          ) : null}
        </Box>
      )}
      {step === 'done' ? (
        ok ? (
          <Box marginTop={1} flexDirection="column">
            <SelectList
              key={`done-ok-${navEpoch}`}
              canBack={false}
              items={[
                { value: 'continue', label: '继续发版', hint: '回首页重新选择' },
                { value: 'exit', label: '退出' },
              ]}
              onSubmit={(item) => {
                if (item.value === 'continue') continueDeploy();
                else exit();
              }}
            />
          </Box>
        ) : (
          <DoneExit onExit={goHome} tip={props.onHome ? 'Enter · ← 回首页' : 'Enter · ← 退出'} />
        )
      ) : null}
    </Box>
  );
}

function ConfirmStep(props: {
  dryRun: boolean;
  config: LoadedConfig;
  server: Server;
  packages: Package[];
  actions: string[];
  onBack: () => void;
  onAction: (i: number) => void;
}) {
  const { dryRun, config, server, packages, actions, onBack, onAction } = props;
  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools · upload-server" subtitle={dryRun ? 'dry-run' : undefined} />
      <WizardHeader current="confirm" />
      <Text color={colors.muted}>
        服务器  {server.name}  ({server.user}@{server.host}
        {server.port && server.port !== 22 ? `:${server.port}` : ''})
      </Text>
      <Text color={colors.muted}>ROOT_PATH  {config.rootPath}</Text>
      <Box flexDirection="column" marginY={1}>
        {packages.map((p) => {
          let shown = p;
          try {
            shown = resolvePackageBuild(config.rootPath, p);
          } catch {
            /* 确认页展示：探测失败仍显示 dest */
          }
          return (
            <Text key={p.name} color={colors.text}>
              · {packageTitle(p)}  →  {describeDest(shown, server.name)}
            </Text>
          );
        })}
      </Box>
      <SelectList
        canBack
        onBack={onBack}
        items={actions.map((a, i) => ({ value: String(i), label: a }))}
        onSubmit={(item) => onAction(Number(item.value))}
      />
    </Box>
  );
}

function DoneExit({ onExit, tip }: { onExit: () => void; tip: string }) {
  // 仅失败完成页；发版进行中不挂此组件
  useInput((_input, key) => {
    if (key.return || key.leftArrow) onExit();
  });
  return (
    <Box marginTop={1}>
      <Text color={colors.muted}>{tip}</Text>
    </Box>
  );
}
