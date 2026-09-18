import { useState } from 'react';
import { Box, Text } from 'ink';
import { Banner } from './ui/Banner.js';
import { SelectList } from './ui/SelectList.js';
import { UploadWizard } from './capabilities/upload-server/UploadWizard.js';
import { colors } from './ui/theme.js';

export function App({ dryRun = false }: { dryRun?: boolean }) {
  const [choice, setChoice] = useState<string | null>(null);

  if (choice === 'upload-server') {
    return (
      <UploadWizard
        key="upload-server"
        dryRun={dryRun}
        onHome={() => setChoice(null)}
      />
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
