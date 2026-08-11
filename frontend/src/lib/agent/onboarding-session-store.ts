import type {
  ChatRequest,
  OnboardingCardData,
  OnboardingContextData,
} from "./chat";
import type { OnboardingSiteDraft } from "./onboarding-site-draft";

export type OnboardingSessionMessage = {
  id: string;
  speaker: "assistant" | "user" | "tool";
  text: string;
  order?: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  onboardingCard?: OnboardingCardData;
  onboardingStep?: {
    currentStep: OnboardingCardData["step"];
    completedSteps: OnboardingCardData["step"][];
    confirmedStep?: OnboardingCardData["step"];
  };
  presentation?: "onboarding_welcome" | "onboarding_step" | "onboarding_complete" | "onboarding_exit";
  isStreaming?: boolean;
};

export type OnboardingSessionSnapshot = {
  context: OnboardingContextData | null;
  conversationId: string | null;
  dismissed: boolean;
  completionNotice: string | null;
  messages: OnboardingSessionMessage[];
  isStreaming: boolean;
  showWorkspaceSelector: boolean;
  siteDraft: OnboardingSiteDraft;
};

export type OnboardingSessionIdentity = {
  userId: number;
  generation: number;
};

export function isLegacyProductsOnboardingMessage(message: OnboardingSessionMessage) {
  return message.onboardingCard?.step === "products"
    || message.onboardingStep?.currentStep === "products";
}

export function continueChatRequest(
  request: ChatRequest,
  conversationId: string | null,
): ChatRequest {
  if (!conversationId || request.conversation_id) return request;
  return { ...request, conversation_id: conversationId };
}

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type OnboardingSessionStoreOptions = {
  getStorage?: () => SessionStorageLike | null;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

const LEGACY_WORKSPACE_SESSION_KEY = "mekyro:onboarding-workspace-id";

export function onboardingWorkspaceSessionKey(userId: number) {
  return `${LEGACY_WORKSPACE_SESSION_KEY}:${userId}`;
}

export function createEmptyOnboardingSessionSnapshot(): OnboardingSessionSnapshot {
  return {
    context: null,
    conversationId: null,
    dismissed: false,
    completionNotice: null,
    messages: [],
    isStreaming: false,
    showWorkspaceSelector: false,
    siteDraft: {
      workspaceId: null,
      variant: null,
      url: "",
      details: "",
      apiKey: "",
      apiSecret: "",
      errors: {},
    },
  };
}

const INACTIVE_SNAPSHOT = createEmptyOnboardingSessionSnapshot();

export function createOnboardingSessionStore(
  options: OnboardingSessionStoreOptions = {},
) {
  const getStorage = options.getStorage ?? (() => (
    typeof window === "undefined" ? null : window.sessionStorage
  ));
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));

  let activeUserId: number | null = null;
  let generation = 0;
  let snapshot = createEmptyOnboardingSessionSnapshot();
  let autoResumePromise: Promise<void> | null = null;
  let completionNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function clearCompletionNoticeTimer() {
    if (completionNoticeTimer === null) return;
    clearTimer(completionNoticeTimer);
    completionNoticeTimer = null;
  }

  function resetMemory(nextUserId: number | null) {
    clearCompletionNoticeTimer();
    activeUserId = nextUserId;
    generation += 1;
    snapshot = createEmptyOnboardingSessionSnapshot();
    autoResumePromise = null;
    notify();
  }

  function removeLegacyWorkspaceKey() {
    getStorage()?.removeItem(LEGACY_WORKSPACE_SESSION_KEY);
  }

  function isValidUserId(userId: number | null | undefined): userId is number {
    return Number.isInteger(userId) && Number(userId) > 0;
  }

  function isCurrent(identity: OnboardingSessionIdentity | null | undefined) {
    return Boolean(
      identity
      && activeUserId === identity.userId
      && generation === identity.generation,
    );
  }

  function activate(userId: number): OnboardingSessionIdentity | null {
    if (!isValidUserId(userId)) return null;
    removeLegacyWorkspaceKey();
    if (activeUserId !== userId) resetMemory(userId);
    return { userId, generation };
  }

  function synchronizeUser(userId: number | null) {
    if (!isValidUserId(userId)) {
      if (activeUserId !== null) resetMemory(null);
      return null;
    }
    return activate(userId);
  }

  function clearForLogout() {
    const storage = getStorage();
    if (activeUserId !== null) {
      storage?.removeItem(onboardingWorkspaceSessionKey(activeUserId));
    }
    storage?.removeItem(LEGACY_WORKSPACE_SESSION_KEY);
    resetMemory(null);
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshotForUser(userId: number | null) {
    return userId !== null && userId === activeUserId
      ? snapshot
      : INACTIVE_SNAPSHOT;
  }

  function getActiveSnapshot() {
    return snapshot;
  }

  function getActiveIdentity(): OnboardingSessionIdentity | null {
    if (activeUserId === null) return null;
    return { userId: activeUserId, generation };
  }

  function update(
    identity: OnboardingSessionIdentity,
    updater: (current: OnboardingSessionSnapshot) => OnboardingSessionSnapshot,
  ) {
    if (!isCurrent(identity)) return false;
    snapshot = updater(snapshot);
    notify();
    return true;
  }

  function ensureAutoResume(
    userId: number | null,
    start: (identity: OnboardingSessionIdentity) => Promise<void>,
  ) {
    if (!isValidUserId(userId)) return null;
    const identity = activate(userId);
    if (!identity) return null;
    if (!autoResumePromise) {
      autoResumePromise = Promise.resolve().then(() => start(identity));
    }
    return autoResumePromise;
  }

  function readWorkspaceId(userId: number) {
    if (!isValidUserId(userId)) return undefined;
    removeLegacyWorkspaceKey();
    const value = getStorage()?.getItem(onboardingWorkspaceSessionKey(userId));
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  function storeWorkspaceId(
    identity: OnboardingSessionIdentity,
    workspaceId: number | null,
  ) {
    if (!isCurrent(identity)) return false;
    const storage = getStorage();
    const key = onboardingWorkspaceSessionKey(identity.userId);
    if (workspaceId && Number.isInteger(workspaceId) && workspaceId > 0) {
      storage?.setItem(key, String(workspaceId));
    } else {
      storage?.removeItem(key);
    }
    return true;
  }

  function showCompletionNotice(
    identity: OnboardingSessionIdentity,
    notice: string,
    duration = 3000,
  ) {
    if (!update(identity, (current) => ({ ...current, completionNotice: notice }))) {
      return false;
    }
    clearCompletionNoticeTimer();
    completionNoticeTimer = setTimer(() => {
      completionNoticeTimer = null;
      update(identity, (current) => ({ ...current, completionNotice: null }));
    }, duration);
    return true;
  }

  return {
    activate,
    clearForLogout,
    ensureAutoResume,
    getActiveIdentity,
    getActiveSnapshot,
    getSnapshotForUser,
    isCurrent,
    readWorkspaceId,
    showCompletionNotice,
    storeWorkspaceId,
    subscribe,
    synchronizeUser,
    update,
  };
}

export const onboardingSessionStore = createOnboardingSessionStore();
