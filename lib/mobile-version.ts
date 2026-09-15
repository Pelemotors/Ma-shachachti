export function mobileVersionPolicy(input: {
  platform: string;
  version: string;
  build: string;
}) {
  const latestVersion = process.env.MOBILE_LATEST_VERSION?.trim() || "0.2.0-lean";
  const minimumSupportedVersion =
    process.env.MOBILE_MINIMUM_VERSION?.trim() || "0.2.0-lean";
  return {
    platform: input.platform,
    version: input.version,
    build: input.build,
    supported: true,
    updateAvailable: false,
    updateRequired: false,
    minimumSupportedVersion,
    latestVersion,
  };
}
