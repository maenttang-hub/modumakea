function readBooleanEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }

  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }

  return fallback;
}

export function isLaunchDeskEnabled() {
  return readBooleanEnv('MODUMAKE_ENABLE_LAUNCH_DESK');
}

export function isBetaEventCollectionEnabled() {
  return readBooleanEnv('MODUMAKE_ENABLE_BETA_EVENTS');
}
