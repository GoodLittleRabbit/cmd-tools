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
import { findDeployConflicts, type DeployConflict } from './deploy/conflicts.js';
import { runDeploy } from './deploy/run.js';
import { openDeployLogFile } from './deploy/logFile.js';
import { packageTitle } from './display.js';
import { aiSetupGuide } from './init.js';
import { Banner } from '../../ui/Banner.js';
import { SelectList } from '../../ui/SelectList.js';
import { GroupPicker } from '../../ui/GroupPicker.js';
import { formatServerEndpoint, WizardContext } from '../../ui/WizardContext.js';
import { WizardHeader } from '../../ui/WizardHeader.js';
import { colors } from '../../ui/theme.js';

type Step = 'server' | 'packages' | 'confirm' | 'deploy' | 'done';

type PkgProgress = {
  message: string;
  done?: boolean;
  ok?: boolean;
};

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
  /** CLI 指定了 --server 时，发版单元页不能 ← 回服务器列表 */
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
  const [pkgProgress, setPkgProgress] = useState<Record<string, PkgProgress>>({});
  const [doneCount, setDoneCount] = useState(0);
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
    setPkgProgress({});
    setDoneCount(0);
    if (props.serverName && props.packageNames?.length) go('confirm');
    else if (props.serverName) go('packages');
    else go('server');
  };

  const conflicts = useMemo(
    () => (server && packages.length ? findDeployConflicts(packages, server.name) : []),
    [server, packages],
  );

  const confirmActions = useMemo(() => {
    const primary = dryRun
      ? conflicts.length
        ? '已知风险，开始演练'
        : '开始演练'
      : conflicts.length
        ? '已知风险，确认发版'
        : '确认发版';
    return [primary, '返回 · 重选发版单元', '返回 · 重选服务器', props.onHome ? '回首页' : '退出'];
  }, [dryRun, props.onHome, conflicts.length]);

  const pkgNames = packages.map((p) => p.name);

  async function startDeploy() {
    if (!server || !packages.length) return;
    setNavEpoch((n) => n + 1);
    setStep('deploy');
    setBusy(true);
    setLogPath('');
    setDeployStartedAt(Date.now());
    setPkgProgress({});
    setDoneCount(0);
    const logFile = openDeployLogFile('upload-server');
    logFile.append(`server ${server.name} · ${server.user}@${server.host}`);
    logFile.append(`packages ${packages.map((x) => x.name).join(', ')}`);
    logFile.append(dryRun ? 'mode=dry-run' : 'mode=real');
    if (conflicts.length) {
      logFile.append(`conflicts ${conflicts.length}`);
      for (const c of conflicts) logFile.append(`  ! ${c.kind}: ${c.message}`);
    }

    const success = await runDeploy({
      rootPath: config.rootPath,
      server,
      packages,
      dryRun,
      emit: (ev) => {
        if (ev.type === 'log') {
          logFile.append(ev.line);
        }
        if (ev.type === 'pkg-start') {
          setPkgProgress((prev) => ({
            ...prev,
            [ev.packageId]: { message: '开始…' },
          }));
          logFile.append(`start ${ev.label || ev.packageId}`);
        }
        if (ev.type === 'progress') {
          setPkgProgress((prev) => ({
            ...prev,
            [ev.packageId]: {
              message: ev.message,
              done: false,
            },
          }));
        }
        if (ev.type === 'step') {
          logFile.append(`  ${ev.packageId} · ${ev.step} · ${ev.status}`);
        }
        if (ev.type === 'pkg-done') {
          setDoneCount((n) => n + 1);
          setPkgProgress((prev) => ({
            ...prev,
            [ev.packageId]: {
              message: ev.ok ? '完成' : ev.error ? `失败：${ev.error}` : '失败',
              done: true,
              ok: ev.ok,
            },
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
  const pkgOrder = packages.map((p) => p.name);
  const totalPkgs = packages.length;
  const bannerTitle = dryRun ? 'cmd-tools · upload-server · dry-run' : 'cmd-tools · upload-server';

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
        <Banner title={bannerTitle} />
        <Box flexDirection="column" marginBottom={1}>
          {guide.map((line, i) => (
            <Text key={i} color={line.startsWith('给 AI') ? colors.accent : undefined}>
              {line || ' '}
            </Text>
          ))}
        </Box>
        {props.onHome ? (
          <Text color={colors.muted}>← 回首页</Text>
        ) : (
          <Text color={colors.muted}>Ctrl+C 退出</Text>
        )}
      </Box>
    );
  }

  if (step === 'server') {
    return (
      <Box flexDirection="column">
        <Banner title={bannerTitle} />
        <WizardHeader current="server" />
        <WizardContext configPath={config.configPath} packagesPlaceholder={false} />
        <Text color={colors.muted}>选择发版目标服务器</Text>
        <Box marginTop={1}>
          <SelectList
            key={`server-${navEpoch}`}
            canBack={Boolean(props.onHome)}
            onBack={props.onHome ? goHome : undefined}
            items={config.servers.map((s) => ({
              value: s.name,
              label: s.name,
              hint: formatServerEndpoint(s),
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
        <Banner title={bannerTitle} />
        <WizardHeader current="packages" />
        <WizardContext
          serverName={server.name}
          serverEndpoint={formatServerEndpoint(server)}
          packages={[]}
          packagesPlaceholder="尚未选择"
          configPath={false}
        />
        <Text color={colors.muted}>空格勾选 · Enter 继续 · ← 返回</Text>
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
        bannerTitle={bannerTitle}
        config={config}
        server={server}
        packages={packages}
        conflicts={conflicts}
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
      <Banner title={bannerTitle} />
      <WizardHeader current="deploy" startedAt={busy ? deployStartedAt : undefined} />
      {server ? (
        <WizardContext
          serverName={server.name}
          serverEndpoint={formatServerEndpoint(server)}
          packages={pkgNames}
          packageCollapseAt={4}
          configPath={false}
        />
      ) : null}

      {busy ? (
        <Box flexDirection="column">
          <Text color={colors.pink}>
            <Spinner type="dots" /> {dryRun ? '演练中' : '发版中'}
            {totalPkgs > 1 ? ' · 并行' : ''}
            {totalPkgs > 0 ? ` · ${doneCount}/${totalPkgs}` : ''}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {pkgOrder.map((name) => {
              const row = pkgProgress[name];
              if (!row) {
                return (
                  <Box key={name}>
                    <Text color={colors.muted}>  ○  {name}</Text>
                  </Box>
                );
              }
              const mark = row.done ? (row.ok ? '✓' : '✗') : '…';
              const color = row.done
                ? row.ok
                  ? colors.accent
                  : colors.danger
                : colors.text;
              return (
                <Box key={name}>
                  <Text color={color}>
                    {'  '}
                    {mark}  {name}
                    <Text color={colors.muted}>  {row.message}</Text>
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color={ok ? colors.accent : colors.danger} bold>
            {ok ? '✓' : '✗'}  {status}
          </Text>
          {logPath ? (
            <Box marginTop={1}>
              <Text color={colors.muted}>
                {ok ? '日志' : '失败日志'}  {logPath}
              </Text>
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
  bannerTitle: string;
  config: LoadedConfig;
  server: Server;
  packages: Package[];
  conflicts: DeployConflict[];
  actions: string[];
  onBack: () => void;
  onAction: (i: number) => void;
}) {
  const { bannerTitle, config, server, packages, conflicts, actions, onBack, onAction } = props;
  return (
    <Box flexDirection="column">
      <Banner title={bannerTitle} />
      <WizardHeader current="confirm" />
      <WizardContext
        serverName={server.name}
        serverEndpoint={formatServerEndpoint(server)}
        packages={packages.map((p) => p.name)}
        packageCollapseAt={99}
        configPath={config.configPath}
      />

      <Text color={colors.muted}>
        ROOT  {config.rootPath}
        {packages.length > 1 ? `  ·  并行 ${packages.length} 个` : ''}
      </Text>

      <Box flexDirection="column" marginY={1}>
        {packages.map((p) => {
          let shown = p;
          try {
            shown = resolvePackageBuild(config.rootPath, p);
          } catch {
            /* 确认页展示：探测失败仍显示 dest */
          }
          return (
            <Box key={p.name}>
              <Text>
                <Text color={colors.accent}>  →  </Text>
                <Text color={colors.text}>{packageTitle(p)}</Text>
                <Text color={colors.muted}>  {describeDest(shown, server.name)}</Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      {conflicts.length ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.danger} bold>
            ⚠ 并行风险 · {conflicts.length}
          </Text>
          {conflicts.map((c, i) => (
            <Box key={`${c.kind}-${i}`}>
              <Text color={colors.pink}>
                {'  '}[{c.kind}] {c.message}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}

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
