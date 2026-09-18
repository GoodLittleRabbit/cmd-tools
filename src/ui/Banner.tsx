import { Box, Text } from 'ink';
import { colors } from './theme.js';

export function Banner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.accent} bold>
        ◆ {title}
      </Text>
      {subtitle ? (
        <Box marginTop={1}>
          <Text color={colors.muted}>{subtitle}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
