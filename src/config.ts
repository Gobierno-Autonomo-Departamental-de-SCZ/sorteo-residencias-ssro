export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === 'REEMPLAZAR') throw new Error(`Falta configurar ${name}.`);
  return value;
}

export function bridgeConfig() {
  const host = requiredEnv('SSRO_BRIDGE_HOST');
  const user = requiredEnv('SSRO_BRIDGE_USER');
  const port = requiredEnv('SSRO_BRIDGE_PORT');
  const keyPath = requiredEnv('SSRO_BRIDGE_KEY_PATH');
  const knownHostsPath = requiredEnv('SSRO_BRIDGE_KNOWN_HOSTS_PATH');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('SSRO_BRIDGE_PORT inválido.');
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(user) || /[\s@]/.test(host)) throw new Error('Destino SSH inválido.');
  return {host, user, port, keyPath, knownHostsPath};
}
