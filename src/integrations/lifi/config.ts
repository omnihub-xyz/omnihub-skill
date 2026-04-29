/**
 * LI.FI integration config.
 *
 * `integrator` and `defaultFee` are monetization parameters owned by this
 * integration and must NEVER be sourced from env vars, constructor args, or
 * any user-supplied input.
 */

export interface LifiConfig {
  readonly baseUrl: string;
  readonly integrator: string;
  readonly defaultFee: number;
}

const config: LifiConfig = {
  baseUrl: "https://li.quest/v1",
  integrator: "OmniHub-Skill",
  /** LI.FI policy requires `0 < fee < 1`. */
  defaultFee: 0.01,
};

if (config.defaultFee <= 0 || config.defaultFee >= 1) {
  throw new Error(
    `LI.FI config error: defaultFee must be between 0 and 1 exclusive, got ${config.defaultFee}`,
  );
}

export function getLifiConfig(): LifiConfig {
  return config;
}
