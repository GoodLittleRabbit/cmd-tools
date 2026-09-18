/** Optional API_PRESET helpers. Conf explicit fields always win. */

export type ApiPresetLayout = {
  jarRel: string;
  moduleRel: string;
  remoteSubdir: string;
  buildCommand: string;
};

export function applyApiPreset(preset: string, shortName: string): ApiPresetLayout {
  const name = preset.trim().toLowerCase();
  if (!name) {
    throw new Error('API 短名行需要 API_PRESET（例如 API_PRESET="yudao"），或改为写全 jar/module/subdir');
  }
  if (name === 'yudao') return yudaoLayout(shortName);
  throw new Error(`未知 API_PRESET="${preset}"（当前支持: yudao）`);
}

/** yudao-cloud 布局。仅在 API_PRESET=yudao 且服务行使用短名时启用。 */
function yudaoLayout(shortName: string): ApiPresetLayout {
  const key = shortName.trim();
  if (!key) {
    throw new Error('API 短名为空');
  }
  if (key === 'gateway') {
    return {
      jarRel: 'yudao-gateway/target/yudao-gateway.jar',
      moduleRel: 'yudao-gateway',
      remoteSubdir: 'gateway-server',
      buildCommand: 'mvn -pl yudao-gateway -am -DskipTests package',
    };
  }
  const moduleRel = `yudao-module-${key}/yudao-module-${key}-server`;
  return {
    jarRel: `${moduleRel}/target/yudao-module-${key}-server.jar`,
    moduleRel,
    remoteSubdir: `${key}-server`,
    buildCommand: `mvn -pl ${moduleRel} -am -DskipTests package`,
  };
}
