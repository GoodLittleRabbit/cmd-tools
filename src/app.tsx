import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { Banner } from './ui/Banner.js';
import { UploadServerApp } from './capabilities/upload-server/index.js';

type Item = { label: string; value: string };

const items: Item[] = [
  { label: 'deploy  ·  交互发版（web/api）', value: 'upload-server' },
  { label: '（更多能力即将加入）', value: 'soon' },
  { label: '退出', value: 'exit' },
];

export function App() {
  const [choice, setChoice] = useState<string | null>(null);

  if (choice === 'upload-server') {
    return <UploadServerApp dryRun={false} />;
  }
  if (choice === 'exit') {
    return <Text>已退出</Text>;
  }
  if (choice === 'soon') {
    return (
      <Box flexDirection="column">
        <Banner title="cmd-tools" />
        <Text color="yellow">该能力还在路上。</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Banner title="cmd-tools" />
      <Text dimColor>选择能力（回车确认）</Text>
      <SelectInput items={items} onSelect={(item) => setChoice(item.value)} />
    </Box>
  );
}
