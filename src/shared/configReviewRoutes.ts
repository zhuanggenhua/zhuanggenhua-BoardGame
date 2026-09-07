export const CONFIG_REVIEW_GAME_IDS = ['summonerwars', 'dicethrone', 'betrayal', 'smashup'] as const;

export type ConfigReviewGameId = typeof CONFIG_REVIEW_GAME_IDS[number];

const CONFIG_REVIEW_GAME_ID_SET = new Set<ConfigReviewGameId>(CONFIG_REVIEW_GAME_IDS);

export function hasGameConfigReview(gameId: string | null | undefined): boolean {
  return Boolean(gameId && CONFIG_REVIEW_GAME_ID_SET.has(gameId as ConfigReviewGameId));
}

export function getGameConfigReviewPath(gameId: string): string {
  return `/games/${gameId}/config`;
}

export function isConfigReviewPath(pathname: string): boolean {
  return CONFIG_REVIEW_GAME_IDS.some((gameId) => {
    const route = getGameConfigReviewPath(gameId);
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}
