export interface GovernorState {
  tier: 'low' | 'medium' | 'high';
}

export function createGovernor(initial: GovernorState['tier'] = 'medium') {
  let tier = initial;
  return {
    get tier() {
      return tier;
    },
    sample(_frameMs: number) {
      // Minimal placeholder: real governor should use moving averages+hysteresis.
      return tier;
    },
    setTier(next: GovernorState['tier']) {
      tier = next;
    },
  };
}
