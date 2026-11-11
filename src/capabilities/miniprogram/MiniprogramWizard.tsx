import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { Banner } from '../../ui/Banner.js';
import { CheckList } from '../../ui/CheckList.js';
import { SelectList } from '../../ui/SelectList.js';
import { WizardHeader, type WizardStep } from '../../ui/WizardHeader.js';
import { colors } from '../../ui/theme.js';
import { loadConfig, type LoadedMiniProgramConfig, type MiniProgramAction, type MiniProgramApp } from './config.js';
import { blockingIssues, defaultVersion, planApps, runPlans, type AppPlan } from './engine.js';

const STEPS: WizardStep[] = [
  { id: 'apps', label: '小程序' },
  { id: 'action', label: '动作' },
  { id: 'meta', label: '版本' },
  { id: 'confirm', label: '确认' },
  { id: 'run', label: '执行' },
];

type Step = 'apps' | 'action' | 'meta' | 'confirm' | 'run' | 'done';

type AppProgress = { message: string; done?: boolean; ok?: boolean; qrcodePath?: string };

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function hasReadyMeta(
  action: MiniProgramAction | null | undefined,
  version?: string,
  desc?: string,
): boolean {
  if (!action) return false;
  if (!VERSION_RE.test(version?.trim() || '')) return false;
  if (action === 'upload' && !(desc?.trim())) return false;
  return true;
}

export function MiniprogramWizard(props: {
  dryRun?: boolean;
  configPath?: string;
  appNames?: string[];
  action?: MiniProgramAction;
  version?: string;
  desc?: string;
  onHome?: () => void;
}) {
  const { exit } = useApp();
  const dryRun = Boolean(props.dryRun);
  const goHome = () => {
    if (props.onHome) props.onHome();
    else exit();
  };

  const [config] = useState<LoadedMiniProgramConfig>(() => loadConfig(props.configPath));
  const [step, setStep] = useState<Step>(() => {
    if (props.appNames?.length && props.action && hasReadyMeta(props.action, props.version, props.desc)) {
      return 'confirm';
    }
    if (props.appNames?.length && props.action) return 'meta';
    if (props.appNames?.length) return 'action';
    return 'apps';
  });
  const [apps, setApps] = useState<MiniProgramApp[]>(() =>
    props.appNames?.length
      ? config.apps.filter((a) => props.appNames!.includes(a.name) || props.appNames!.includes(a.appid))
      : [],
  );
  const [action, setAction] = useState<MiniProgramAction | null>(props.action ?? null);
  const [version, setVersion] = useState(props.version?.trim() || defaultVersion());
  const [desc, setDesc] = useState(props.desc?.trim() || '');
  const [status, setStatus] = useState('');
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | undefined>();
  const [progress, setProgress] = useState<Record<string, AppProgress>>({});
  const [doneCount, setDoneCount] = useState(0);
  const [navEpoch, setNavEpoch] = useState(0);

  function go(next: Step) {
    setStatus('');
    setNavEpoch((n) => n + 1);
    setStep(next);
  }

  const plans: AppPlan[] = useMemo(() => {
    if (!action || !apps.length) return [];
    return planApps({
      rootPath: config.rootPath,
      apps,
      action,
      version,
      desc,
    });
  }, [action, apps, config.rootPath, desc, version]);

  const blocked = useMemo(
    () => plans.flatMap((p) => blockingIssues(p, dryRun).map((issue) => ({ name: p.app.name, issue }))),
    [dryRun, plans],
  );

  const bannerTitle = dryRun ? 'cmd-tools · 小程序上传 · dry-run' : 'cmd-tools · 小程序上传';

  async function startRun() {
    if (!action || !plans.length) return;
    if (blocked.length) {
      setStatus('请先处理发布前的错误');
      return;
    }
    setNavEpoch((n) => n + 1);
    setStep('run');
    setBusy(true);
    setStartedAt(Date.now());
    setProgress({});
    setDoneCount(0);
    const { ok: success } = await runPlans(plans, {
      dryRun,
      emit: (ev) => {
        if (ev.type === 'app-start') {
          setProgress((prev) => ({ ...prev, [ev.name]: { message: '开始…' } }));
        }
        if (ev.type === 'progress') {
          setProgress((prev) => ({
            ...prev,
            [ev.name]: { message: ev.message, done: false },
          }));
        }
        if (ev.type === 'app-done') {
          setDoneCount((n) => n + 1);
          setProgress((prev) => ({
            ...prev,
            [ev.name]: {
              message: ev.ok
                ? ev.qrcodePath
                  ? `完成 · 预览码 ${ev.qrcodePath}`
                  : '完成'
                : ev.error
                  ? `失败：${ev.error.split('\n')[0]}`
                  : '失败',
              done: true,
              ok: ev.ok,
              qrcodePath: ev.qrcodePath,
            },
          }));
        }
      },
    });
    setOk(success);
    setStatus(success ? (dryRun ? 'dry-run 完成' : action === 'preview' ? '预览完成' : '上传完成') : '执行失败');
    setBusy(false);
    setStep('done');
  }

  const continueAgain = () => {
    if (props.onHome) {
      props.onHome();
      return;
    }
    setApps(
      props.appNames?.length
        ? config.apps.filter((a) => props.appNames!.includes(a.name) || props.appNames!.includes(a.appid))
        : [],
    );
    setAction(props.action ?? null);
    setVersion(props.version?.trim() || defaultVersion());
    setDesc(props.desc?.trim() || '');
    setStatus('');
    setOk(true);
    setBusy(false);
    setProgress({});
    setDoneCount(0);
    setStartedAt(undefined);
    if (props.appNames?.length && props.action && hasReadyMeta(props.action, props.version, props.desc)) go('confirm');
    else if (props.appNames?.length && props.action) go('meta');
    else if (props.appNames?.length) go('action');
    else go('apps');
  };

  if (!config.apps.length) {
    return (
      <Box flexDirection="column">
        <Banner title={bannerTitle} />
        <Text>配置里还没有 apps，请先填写 {config.configPath}</Text>
        <Box marginTop={1}>
          <Text color={colors.muted}>{props.onHome ? '← 回首页' : 'Ctrl+C 退出'}</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'apps') {
    return (
      <Box flexDirection="column">
        <Banner title={bannerTitle} />
        <WizardHeader current="apps" steps={STEPS} />
        <Text color={colors.muted}>空格勾选 · Enter 继续 · 至少选择一个</Text>
        <Box marginTop={1}>
          <CheckList
            key={`apps-${navEpoch}`}
            canBack={Boolean(props.onHome)}
            onBack={props.onHome ? goHome : undefined}
            items={config.apps.map((a) => ({ name: a.name, label: `${a.name}  ${a.appid}` }))}
            onSubmit={(names) => {
              if (!names.length) {
                setStatus('请至少勾选一个小程序');
                return;
              }
              const want = new Set(names);
              setApps(config.apps.filter((a) => want.has(a.name)));
              go('action');
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

  if (step === 'action') {
    return (
      <Box flexDirection="column">
        <Banner title={bannerTitle} />
        <WizardHeader current="action" steps={STEPS} />
        <Text color={colors.muted}>
          已选  {apps.map((a) => a.name).join(' · ')}
        </Text>
        <Box marginTop={1}>
          <SelectList
            key={`action-${navEpoch}`}
            canBack={!props.appNames?.length || Boolean(props.onHome)}
            onBack={() => {
              if (props.appNames?.length) goHome();
              else go('apps');
            }}
            items={[
              { value: 'preview', label: '预览 preview', hint: '生成预览二维码，不发布' },
              { value: 'upload', label: '上传 upload', hint: '上传为微信开发版' },
            ]}
            onSubmit={(item) => {
              setAction(item.value as MiniProgramAction);
              go('meta');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'meta' && action) {
    return (
      <Box flexDirection="column">
        <Banner title={bannerTitle} />
        <WizardHeader current="meta" steps={STEPS} />
        <Text color={colors.muted}>
          已选  {apps.map((a) => a.name).join(' · ')}  ·  {action === 'preview' ? '预览' : '上传'}
        </Text>
        <Box marginTop={1}>
          <VersionRemarkForm
            key={`meta-${navEpoch}`}
            version={version}
            desc={desc}
            requireDesc={action === 'upload'}
            onChangeVersion={setVersion}
            onChangeDesc={setDesc}
            onBack={() => (props.action ? (props.appNames?.length ? goHome() : go('apps')) : go('action'))}
            onSubmit={(nextVersion, nextDesc) => {
              setVersion(nextVersion);
              setDesc(nextDesc);
              go('confirm');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'confirm' && action && plans.length) {
    const confirmItems = blocked.length
      ? [
          { value: 'meta', label: '返回 · 改版本备注' },
          { value: 'apps', label: '返回 · 重选小程序' },
          { value: 'action', label: '返回 · 重选动作' },
          { value: 'home', label: props.onHome ? '回首页' : '退出' },
        ]
      : [
          {
            value: 'go',
            label: dryRun ? '开始演练' : action === 'preview' ? '确认预览' : '确认上传',
          },
          { value: 'meta', label: '返回 · 改版本备注' },
          { value: 'apps', label: '返回 · 重选小程序' },
          { value: 'action', label: '返回 · 重选动作' },
          { value: 'home', label: props.onHome ? '回首页' : '退出' },
        ];
    return (
      <Box flexDirection="column">
        <Banner title={bannerTitle} />
        <WizardHeader current="confirm" steps={STEPS} />
        <Text color={colors.muted}>
          ROOT  {config.rootPath}
          {dryRun ? '  ·  dry-run' : ''}
        </Text>
        <Box flexDirection="column" marginY={1}>
          {plans.map((p) => {
            const fails = blockingIssues(p, dryRun);
            return (
              <Box key={p.app.appid} flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={colors.accent}>  →  </Text>
                  <Text>{p.app.name}</Text>
                  <Text color={colors.muted}>  {p.app.appid}</Text>
                </Text>
                <Text color={colors.muted}>
                  {'      '}动作 {action}  ·  版本 {p.version}
                </Text>
                <Text color={p.desc ? colors.muted : colors.danger}>
                  {'      '}备注 {p.desc || '（未填写）'}
                </Text>
                <Text color={colors.muted}>
                  {'      '}构建 {p.build ?? '（无）'}
                </Text>
                <Text color={colors.muted}>
                  {'      '}工程 {projectLabel(p)}
                </Text>
                <Text color={p.privateKeyPath ? colors.muted : colors.danger}>
                  {'      '}密钥 {p.privateKeyPath ? `已找到  ${p.privateKeyPath}` : '未找到'}
                </Text>
                {fails.map((issue) => (
                  <Text key={issue} color={colors.danger}>
                    {'      '}错误 {issue.split('\n')[0]}
                  </Text>
                ))}
              </Box>
            );
          })}
        </Box>
        {blocked.length ? (
          <Box marginBottom={1}>
            <Text color={colors.danger}>发布前需先处理以上错误，无法继续。</Text>
          </Box>
        ) : null}
        {status ? (
          <Box marginBottom={1}>
            <Text color={colors.danger}>{status}</Text>
          </Box>
        ) : null}
        <SelectList
          key={`confirm-${navEpoch}`}
          canBack
          onBack={() => go('meta')}
          items={confirmItems}
          onSubmit={(item) => {
            if (item.value === 'go') void startRun();
            else if (item.value === 'apps') go('apps');
            else if (item.value === 'action') go('action');
            else if (item.value === 'meta') go('meta');
            else goHome();
          }}
        />
      </Box>
    );
  }

  const names = plans.map((p) => p.app.name);
  return (
    <Box flexDirection="column">
      <Banner title={bannerTitle} />
      <WizardHeader current="run" startedAt={busy ? startedAt : undefined} steps={STEPS} />
      {busy ? (
        <Box flexDirection="column">
          <Text color={colors.pink}>
            <Spinner type="dots" /> {dryRun ? '校验中' : '执行中'}
            {names.length > 0 ? `  ·  ${doneCount}/${names.length}` : ''}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {names.map((name) => {
              const row = progress[name];
              if (!row) {
                return (
                  <Box key={name}>
                    <Text color={colors.muted}>  ○  {name}</Text>
                  </Box>
                );
              }
              const mark = row.done ? (row.ok ? '✓' : '✗') : '…';
              const color = row.done ? (row.ok ? colors.accent : colors.danger) : colors.text;
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
        </Box>
      )}

      {step === 'done' ? (
        ok ? (
          <Box marginTop={1}>
            <SelectList
              key={`done-ok-${navEpoch}`}
              canBack={false}
              items={[
                { value: 'continue', label: '继续', hint: '回首页重新选择' },
                { value: 'exit', label: '退出' },
              ]}
              onSubmit={(item) => {
                if (item.value === 'continue') continueAgain();
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

function projectLabel(plan: AppPlan): string {
  if (plan.expectedProjectRel) {
    return `${plan.expectedProjectRel}（构建后期望）`;
  }
  if (plan.project) return plan.project.rel === '.' ? plan.project.abs : plan.project.rel;
  return '（未找到）';
}

function VersionRemarkForm({
  version,
  desc,
  requireDesc,
  onChangeVersion,
  onChangeDesc,
  onSubmit,
  onBack,
}: {
  version: string;
  desc: string;
  requireDesc: boolean;
  onChangeVersion: (value: string) => void;
  onChangeDesc: (value: string) => void;
  onSubmit: (version: string, desc: string) => void;
  onBack: () => void;
}) {
  const [focus, setFocus] = useState<'version' | 'desc'>('version');
  const [error, setError] = useState('');

  function submit() {
    const ver = version.trim();
    const remark = desc.trim();
    if (!VERSION_RE.test(ver)) {
      setError('版本号须为 x.y.z，例如 0.0.1');
      setFocus('version');
      return;
    }
    if (requireDesc && !remark) {
      setError('上传必须填写备注');
      setFocus('desc');
      return;
    }
    setError('');
    onSubmit(ver, remark);
  }

  useInput((input, key) => {
    if (key.leftArrow && !(focus === 'version' ? version : desc)) {
      onBack();
      return;
    }
    if (key.upArrow || (key.tab && key.shift)) {
      setFocus('version');
      setError('');
      return;
    }
    if (key.downArrow || key.tab) {
      setFocus('desc');
      setError('');
      return;
    }
    if (key.return) {
      if (focus === 'version') {
        setFocus('desc');
        setError('');
        return;
      }
      submit();
      return;
    }
    if (key.escape) {
      onBack();
      return;
    }
    const cur = focus === 'version' ? version : desc;
    if (key.backspace || key.delete) {
      const next = cur.slice(0, -1);
      if (focus === 'version') onChangeVersion(next);
      else onChangeDesc(next);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      const next = cur + input;
      if (focus === 'version') onChangeVersion(next);
      else onChangeDesc(next);
    }
  });

  return (
    <Box flexDirection="column">
      <FieldLine
        label="版本"
        value={version}
        placeholder={defaultVersion()}
        active={focus === 'version'}
      />
      <FieldLine
        label="备注"
        value={desc}
        placeholder={requireDesc ? '必填，本次上传说明' : '可选'}
        active={focus === 'desc'}
      />
      {error ? (
        <Box marginTop={1}>
          <Text color={colors.danger}>{error}</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={colors.muted}>
            Tab 切换 · Enter 确认 · ← 返回（当前栏为空时）
            {requireDesc ? ' · 上传必须填写备注' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function FieldLine({
  label,
  value,
  placeholder,
  active,
}: {
  label: string;
  value: string;
  placeholder: string;
  active: boolean;
}) {
  return (
    <Box>
      <Text color={active ? colors.accent : colors.muted} bold={active}>
        {active ? '❯ ' : '  '}
        {label}{'  '}
      </Text>
      {value ? (
        <Text color={colors.text}>
          {value}
          {active ? '█' : ''}
        </Text>
      ) : (
        <Text color={colors.muted}>
          {placeholder}
          {active ? '█' : ''}
        </Text>
      )}
    </Box>
  );
}

function DoneExit({ onExit, tip }: { onExit: () => void; tip: string }) {
  useInput((_input, key) => {
    if (key.return || key.leftArrow) onExit();
  });
  return (
    <Box marginTop={1}>
      <Text color={colors.muted}>{tip}</Text>
    </Box>
  );
}
