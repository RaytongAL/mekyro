type RequirementRefreshHandler = (
  workspaceId: number,
  invalidatedCardId?: string | null,
) => void;

let requirementRefreshHandler: RequirementRefreshHandler | null = null;

export function setOnboardingRequirementRefreshHandler(
  handler: RequirementRefreshHandler,
) {
  requirementRefreshHandler = handler;
}

export function notifyOnboardingRequirementUpdated(
  workspaceId: number,
  invalidatedCardId?: string | null,
) {
  requirementRefreshHandler?.(workspaceId, invalidatedCardId);
}
