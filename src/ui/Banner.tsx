import React from 'react';
import { Box, Text } from 'ink';

export function Banner({ title }: { title: string }) {
  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={2} marginY={1}>
      <Text bold color="magenta">
        {title}
      </Text>
    </Box>
  );
}
