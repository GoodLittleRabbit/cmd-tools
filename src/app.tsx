import { useMemo, useState } from 'react';
import fs from 'node:fs';
import { Box, Text, useInput } from 'ink';
import { Banner } from './ui/Banner.js';
import { SelectList } from './ui/SelectList.js';
import { UploadWizard } from './capabilities/upload-server/UploadWizard.js';
import { aiSetupGuide, isEmptyUserConfig } from './capabilities/upload-server/init.js';
import { lastFailLogPath } from './capabilities/upload-server/deploy/logFile.js';
import { colors } from './ui/theme.js';

export function App({
  dryRun = false,
  configPath,
}: {
  dryRun?: boolean;
  /** 启动时 ensure 后的配置路径 */
  configPath: string;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [empty, setEmpty] = useState(() => isEmptyUserConfig(configPath));
  const guide = useMemo(() => aiSetupGuide(configPath), [configPath]);

  if (choice === 'upload-server') {
    return (
      <UploadWizard
        key="upload-server"
        dryRun={dryRun}
        configPath={configPath}
        onHome={() => {
          setEmpty(isEmptyUserConfig(configPath));
          setChoice(null);
        }}
      />
    );
  }

  if (choice === 'log') {
    return <LogViewer onBack={() => setChoice(null)} />;
  }

  if (empty) {
    return (
      <Box flexDirection="column">
        <Banner title="cmd-tools" subtitle="待配置" />
        <Box flexDirection="column" marginBottom={1}>
          {guide.map((line, i) => (
            <Text key={i} color={line.startsWith('给 AI') ? colors.accent : colors.text}>
              {line || ' '}
            </Text>
          ))}
        </Box>
        <SelectList
          key="setup-empty"
          canBack={false}
          items={[
            { value: 'reload', label: '已填好配置，继续', hint: '重新检测配置文件' },
            { value: 'log', label: '/log 查看失败日志' },
            { value: 'exit', label: '退出' },
          ]}
          onSubmit={(item) => {
            if (item.value === 'exit') process.exit(0);
            if (item.value === 'log') {
              setChoice('log');
              return;
            }
            setEmpty(isEmptyUserConfig(configPath));
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools" subtitle="Ink TUI" />
      <Text color={colors.muted}>选择能力</Text>
      <Box marginTop={1}>
        <SelectList
          key="home"
          canBack={false}
          items={[
            { value: 'upload-server', label: 'upload-server', hint: '打包上传 web / api' },
            { value: 'log', label: '/log', hint: '查看上次发版失败日志' },
            { value: 'exit', label: '退出' },
          ]}
          onSubmit={(item) => {
            if (item.value === 'exit') process.exit(0);
            setChoice(item.value);
          }}
        />
      </Box>
    </Box>
  );
}

function LogViewer({ onBack }: { onBack: () => void }) {
  const file = lastFailLogPath();
  const body = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').replace(/\s+$/, '')
    : '暂无失败日志。\n成功发版不写日志；失败时写入：\n' + file;

  useInput((_input, key) => {
    if (key.leftArrow || key.return || key.escape) onBack();
  });

  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools · /log" subtitle="失败日志" />
      <Text color={colors.muted}>{file}</Text>
      <Box marginY={1} flexDirection="column">
        {body.split('\n').map((line, i) => (
          <Text key={i}>{line || ' '}</Text>
        ))}
      </Box>
      <Text color={colors.muted}>Enter · ← 返回</Text>
    </Box>
  );
}
