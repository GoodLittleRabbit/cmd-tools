/** Modern terminal palette — theme accent is purple */
export const colors = {
  /** 主题色 / 当前项 */
  accent: '#aa7eff',
  /** 次要文字 */
  muted: '#959595',
  /** 同主题色别名（完成态） */
  purple: '#aa7eff',
  /** 进度 / 点缀 */
  pink: '#ff5eb2',
  /** 错误 / 危险 */
  danger: '#ff3e51',
  text: '#ffffff',
} as const;

export type ThemeColor = (typeof colors)[keyof typeof colors];
