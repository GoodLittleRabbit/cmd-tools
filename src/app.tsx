import { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { Banner } from './ui/Banner.js';
import { SelectList } from './ui/SelectList.js';
import { UploadWizard } from './capabilities/upload-server/UploadWizard.js';
import { aiSetupGuide, isEmptyUserConfig } from './capabilities/upload-server/init.js';
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
            { value: 'exit', label: '退出' },
          ]}
          onSubmit={(item) => {
            if (item.value === 'exit') process.exit(0);
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
