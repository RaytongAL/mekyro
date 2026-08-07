import { AlertTriangle, ArrowLeft, Bot, Check, CircleUserRound, Loader2, RotateCcw, SendHorizonal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import i18n from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import styles from "./supplier-shell.module.css";
import {
  streamChat,
  type ChatRequest,
  type OnboardingCardAction,
  type OnboardingCardData,
  type OnboardingContextData,
  type OnboardingSiteVariant,
  type OnboardingWorkspaceOption,
} from "@/lib/agent/chat";
import { getCurrentAuthUser } from "@/lib/auth/core";
import {
  isLegacyProductsOnboardingMessage,
  onboardingSessionStore,
  type OnboardingSessionIdentity,
  type OnboardingSessionMessage,
  type OnboardingSessionSnapshot,
} from "@/lib/agent/onboarding-session-store";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";
import { setOnboardingRequirementRefreshHandler } from "./onboarding-session-events";
import {
  createEmptyOnboardingSiteDraft,
  isShopifyOnboardingCard,
  validateOnboardingSiteDraft,
  type OnboardingSiteDraftField,
} from "@/lib/agent/onboarding-site-draft";

type CommandChatPanelProps = {
  mode?: "entry" | "full" | "rail";
  onOpenFullChat?: () => void;
};

// 模块级共享消息状态，entry ↔ full 切换时保持对话不丢失
let _sharedMessages: RailMessage[] = [];
let _sharedDraft = "";
let _sharedIsStreaming = false;

function readOnboardingWorkspaceId(): number | undefined {
  const identity = onboardingSessionStore.getActiveIdentity();
  return identity
    ? onboardingSessionStore.readWorkspaceId(identity.userId)
    : undefined;
}

function isOnboardingStartText(text: string) {
  const normalized = text.toLowerCase();
  return ["开始入驻", "入驻引导", "继续入驻", "onboarding", "start onboarding"]
    .some((keyword) => normalized.includes(keyword));
}

const commonQuestions = [
  "有多少条线索？",
  "各阶段的线索分布情况",
  "日本市场有哪些线索？",
  "帮我看看最新的一条线索",
  "帮我看看最近的联系记录",
];

const commonQuestionsEn = [
  "How many leads do I have?",
  "Lead distribution by stage",
  "Show me leads from Japan",
  "Show me the latest lead",
  "Show recent contact logs",
];

type RailMessage = OnboardingSessionMessage;

const ONBOARDING_STEP_ENTRY_ACTIONS = new Set([
  "resume_onboarding",
  "continue_onboarding",
  "select_onboarding_workspace",
  "back_onboarding_step",
]);

const ONBOARDING_STEP_TRANSITION_ACTIONS = new Set([
  "confirm_onboarding_card",
  "resolve_onboarding_execution",
]);

let _messageOrder = 0;

function nextMessageOrder() {
  _messageOrder += 1;
  return _messageOrder;
}

function updateOnboardingSession(
  updater: (snapshot: OnboardingSessionSnapshot) => OnboardingSessionSnapshot,
  identity = onboardingSessionStore.getActiveIdentity(),
) {
  if (!identity) return false;
  return onboardingSessionStore.update(identity, updater);
}

function refreshOnboardingRequirementAfterSettingsSave(
  workspaceId: number,
  invalidatedCardId?: string | null,
) {
  const identity = onboardingSessionStore.getActiveIdentity();
  if (!identity) return;
  const currentSnapshot = onboardingSessionStore.getActiveSnapshot();
  const context = currentSnapshot.context;
  if (context?.workspace_id !== workspaceId) return;

  updateOnboardingSession((snapshot) => ({
    ...snapshot,
    messages: snapshot.messages
      .filter((message) => message.presentation !== "onboarding_complete")
      .map((message) => {
        const card = message.onboardingCard;
        if (!card || card.card_id !== invalidatedCardId) return message;
        return {
          ...message,
          onboardingCard: {
            ...card,
            status: "superseded" as const,
            actions: [],
          },
        };
      }),
  }), identity);

  if (
    onboardingSessionStore.getActiveSnapshot().isStreaming
    || !["in_progress", "completed"].includes(context.status)
  ) return;

  void sendOnboardingSessionRequest(
    {
      workspace_id: workspaceId,
      action: { type: "resume_onboarding" },
    },
    "",
    { silent: true, identity },
  );
}

setOnboardingRequirementRefreshHandler(
  refreshOnboardingRequirementAfterSettingsSave,
);

function setOnboardingWorkspaceSelectorVisible(visible: boolean) {
  updateOnboardingSession((snapshot) => ({
    ...snapshot,
    showWorkspaceSelector: visible,
  }));
}

function mergeChatMessages(localMessages: RailMessage[], onboardingMessages: RailMessage[]) {
  const messagesById = new Map<string, RailMessage>();
  for (const message of [...localMessages, ...onboardingMessages]) {
    messagesById.set(message.id, message);
  }
  return [...messagesById.values()].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  );
}

async function sendOnboardingSessionRequest(
  request: ChatRequest,
  visibleUserText: string,
  options?: {
    silent?: boolean;
    assistantId?: string;
    identity?: OnboardingSessionIdentity;
  },
) {
  const identity = options?.identity ?? onboardingSessionStore.getActiveIdentity();
  if (
    !identity
    || !onboardingSessionStore.isCurrent(identity)
    || onboardingSessionStore.getActiveSnapshot().isStreaming
  ) return;

  const silent = options?.silent === true;
  const actionType = request.action?.type;
  const explicitStart = isOnboardingStartText(request.message ?? "");
  const assistantId = options?.assistantId
    ?? `onboarding-assistant-${Date.now()}-${nextMessageOrder()}`;
  const trimmed = visibleUserText.trim();
  let assistantHasContent = false;

  updateOnboardingSession((snapshot) => {
    const messages = [...snapshot.messages];
    if (!silent && trimmed) {
      messages.push({
        id: `onboarding-user-${Date.now()}-${nextMessageOrder()}`,
        speaker: "user",
        text: trimmed,
        order: nextMessageOrder(),
      });
    }
    if (!messages.some((message) => message.id === assistantId)) {
      messages.push({
        id: assistantId,
        speaker: "assistant",
        text: "",
        order: nextMessageOrder(),
        isStreaming: true,
      });
    }
    return { ...snapshot, messages, isStreaming: true };
  }, identity);

  try {
    for await (const event of streamChat(request)) {
      if (!onboardingSessionStore.isCurrent(identity)) return;
      switch (event.type) {
        case "text":
          assistantHasContent = true;
          updateOnboardingSession((snapshot) => ({
            ...snapshot,
            messages: snapshot.messages.map((message) =>
              message.id === assistantId
                ? { ...message, text: message.text + event.data.text }
                : message,
            ),
          }), identity);
          break;

        case "onboarding_card":
          assistantHasContent = true;
          updateOnboardingSession((snapshot) => {
            let matchedExistingCard = false;
            const messages = snapshot.messages.map((message) => {
              const existingCard = message.onboardingCard;
              if (existingCard && existingCard.card_id === event.data.replaces_card_id) {
                return {
                  ...message,
                  onboardingCard: {
                    ...existingCard,
                    status: "superseded" as const,
                    actions: [],
                  },
                };
              }
              if (existingCard && existingCard.card_id === event.data.card_id) {
                matchedExistingCard = true;
                return { ...message, onboardingCard: event.data };
              }
              return message;
            });
            if (matchedExistingCard) return { ...snapshot, messages };

            const targetIndex = messages.findIndex((message) => message.id === assistantId);
            if (targetIndex >= 0 && !messages[targetIndex].onboardingCard) {
              messages[targetIndex] = {
                ...messages[targetIndex],
                onboardingCard: event.data,
              };
            } else {
              messages.push({
                id: `${assistantId}-card-${event.data.card_id}`,
                speaker: "assistant",
                text: "",
                order: nextMessageOrder(),
                onboardingCard: event.data,
                isStreaming: true,
              });
            }
            return { ...snapshot, messages };
          }, identity);
          break;

        case "onboarding_context":
          onboardingSessionStore.storeWorkspaceId(identity, event.data.workspace_id);
          if (
            actionType === "finish_onboarding"
            && event.data.status === "completed"
            && event.data.completion_acknowledged
          ) {
            const notice = i18n.language.startsWith("zh")
              ? "入驻引导已完成，已恢复普通对话。"
              : "Onboarding is complete. Normal chat has resumed.";
            onboardingSessionStore.showCompletionNotice(identity, notice);
          }
          updateOnboardingSession((snapshot) => {
            const isAbandon = actionType === "abandon_onboarding";
            const isFinish = actionType === "finish_onboarding"
              && event.data.status === "completed"
              && event.data.completion_acknowledged;
            const isAcknowledgedCompletion = event.data.status === "completed"
              && event.data.completion_acknowledged;
            const currentStep = event.data.current_step;
            const requestedStep = request.action?.step;
            const isStepTransition = Boolean(
              actionType
              && ONBOARDING_STEP_TRANSITION_ACTIONS.has(actionType)
              && requestedStep
              && currentStep
              && currentStep !== "done"
              && currentStep !== requestedStep,
            );
            const shouldPresentStep = Boolean(
              event.data.status === "in_progress"
              && currentStep
              && currentStep !== "done"
              && (
                explicitStart
                || (actionType && ONBOARDING_STEP_ENTRY_ACTIONS.has(actionType))
                || isStepTransition
              ),
            );
            const shouldDismiss = isAbandon
              || isFinish
              || actionType === "pause_onboarding"
              || event.data.status === "paused"
              || (isAcknowledgedCompletion && !explicitStart);
            const shouldReactivate = explicitStart
              || actionType === "continue_onboarding"
              || actionType === "restart_onboarding"
              || event.data.status === "in_progress"
              || (actionType === "resume_onboarding" && event.data.status !== "paused" && !isAcknowledgedCompletion)
              || (actionType === "select_onboarding_workspace" && event.data.status !== "paused" && !isAcknowledgedCompletion);

            let messages = snapshot.messages;
            const resolvedCardId = request.action?.card_id;
            if (resolvedCardId) {
              const resolvedStatus = actionType === "cancel_onboarding_card"
                ? "cancelled" as const
                : actionType === "confirm_onboarding_card"
                  ? event.data.execution?.card_id === resolvedCardId
                    ? event.data.execution.status ?? "processing" as const
                    : "applied" as const
                  : null;
              if (resolvedStatus) {
                messages = messages.map((message) =>
                  message.onboardingCard?.card_id === resolvedCardId
                    ? {
                        ...message,
                        onboardingCard: {
                          ...message.onboardingCard,
                          status: resolvedStatus,
                          actions: resolvedStatus === "failed" || resolvedStatus === "result_unknown"
                            ? message.onboardingCard.actions
                            : [],
                        },
                      }
                    : message,
                );
              }
            }
            if (isFinish) {
              messages = [];
            } else if (isAbandon) {
              assistantHasContent = true;
              messages = messages
                .filter((message) => message.id === assistantId)
                .map((message) => ({
                  ...message,
                  presentation: "onboarding_exit" as const,
                }));
            } else if (event.data.status === "not_started") {
              assistantHasContent = true;
              messages = messages.map((message) =>
                message.id === assistantId
                  ? { ...message, presentation: "onboarding_welcome" as const }
                  : message,
              );
            } else if (event.data.status === "completed" && actionType !== "finish_onboarding") {
              assistantHasContent = true;
              messages = messages.map((message) =>
                message.id === assistantId
                  ? { ...message, presentation: "onboarding_complete" as const }
                  : message,
              );
            } else if (shouldPresentStep && currentStep && currentStep !== "done") {
              assistantHasContent = true;
              messages = messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      presentation: "onboarding_step" as const,
                      onboardingStep: {
                        currentStep,
                        completedSteps: event.data.completed_steps,
                        ...(isStepTransition && requestedStep
                          ? { confirmedStep: requestedStep }
                          : {}),
                      },
                    }
                  : message,
              );
            }

            return {
              ...snapshot,
              context: event.data,
              dismissed: shouldDismiss ? true : shouldReactivate ? false : snapshot.dismissed,
              messages,
              showWorkspaceSelector: event.data.status === "selection_required",
              siteDraft: (
                event.data.workspace_id !== snapshot.siteDraft.workspaceId
                || currentStep !== "site"
                || (actionType === "cancel_onboarding_card" && requestedStep === "site")
              )
                ? createEmptyOnboardingSiteDraft(event.data.workspace_id)
                : snapshot.siteDraft,
            };
          }, identity);
          break;

        case "done":
          updateOnboardingSession((snapshot) => ({
            ...snapshot,
            messages: assistantHasContent
              ? snapshot.messages.map((message) =>
                  message.id === assistantId || message.id.startsWith(`${assistantId}-card-`)
                    ? { ...message, isStreaming: false }
                    : message,
                )
              : snapshot.messages.filter((message) => message.id !== assistantId),
          }), identity);
          break;

        case "error":
          assistantHasContent = true;
          updateOnboardingSession((snapshot) => ({
            ...snapshot,
            messages: snapshot.messages.map((message) =>
              message.id === assistantId
                ? { ...message, text: `❌ ${event.data.message}`, isStreaming: false }
                : message,
            ),
          }), identity);
          break;
      }
    }
  } catch {
    const requestFailed = i18n.language.startsWith("zh")
      ? "请求失败，请重试"
      : "Request failed, please try again";
    updateOnboardingSession((snapshot) => ({
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === assistantId
          ? { ...message, text: requestFailed, isStreaming: false }
          : message,
      ),
    }), identity);
  } finally {
    updateOnboardingSession(
      (snapshot) => ({ ...snapshot, isStreaming: false }),
      identity,
    );
  }
}

function ensureOnboardingAutoResume(userId: number) {
  return onboardingSessionStore.ensureAutoResume(
    userId,
    (identity) => {
      const workspaceId = onboardingSessionStore.readWorkspaceId(userId);
      return sendOnboardingSessionRequest(
        {
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
          action: { type: "resume_onboarding" },
        },
        "",
        { silent: true, assistantId: "onboarding-auto-resume", identity },
      );
    },
  );
}

type OnboardingReviewCardProps = {
  card: OnboardingCardData;
  disabled: boolean;
  isZh: boolean;
  onAction: (card: OnboardingCardData, action: OnboardingCardAction) => void;
};

function OnboardingReviewCard({
  card,
  disabled,
  isZh,
  onAction,
}: OnboardingReviewCardProps) {
  const statusLabels = isZh
    ? {
        draft: "待确认",
        processing: "执行中",
        failed: "执行失败",
        result_unknown: "待核对",
        applied: "已写入",
        cancelled: "已取消",
        superseded: "已更新",
      }
    : {
        draft: "Review",
        processing: "Processing",
        failed: "Failed",
        result_unknown: "Needs review",
        applied: "Applied",
        cancelled: "Cancelled",
        superseded: "Updated",
      };
  const isActionable = ["draft", "failed", "result_unknown"].includes(card.status);

  return (
    <Card
      size="sm"
      className={styles.onboardingCard}
      data-onboarding-card-id={card.card_id}
    >
      <CardHeader>
        <CardTitle>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
        <CardAction>
          <Badge variant={card.status === "applied" ? "default" : "outline"}>
            {statusLabels[card.status]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className={styles.onboardingCardFields}>
          {card.fields.map((field) => (
            <div key={field.key} className={styles.onboardingCardField}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        {card.warning ? (
          <p className={styles.onboardingCardWarning}>
            <AlertTriangle aria-hidden="true" />
            <span>{card.warning}</span>
          </p>
        ) : null}
        {isActionable && card.status !== "result_unknown" ? (
          <p className={styles.onboardingCardEditHint}>
            {isZh
              ? "如需调整，请直接在下方输入框发送修改内容。"
              : "To make changes, send the updated details in the message box below."}
          </p>
        ) : null}
      </CardContent>
      {isActionable && card.actions.length > 0 ? (
        <CardFooter className={styles.onboardingCardFooter}>
          {card.actions.map((action) => (
            <Button
              key={`${action.type}-${action.resolution || "default"}`}
              type="button"
              size="sm"
              variant={action.variant === "primary" ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onAction(card, action)}
            >
              {action.type === "cancel_onboarding_card" ? (
                <X data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Check data-icon="inline-start" aria-hidden="true" />
              )}
              {action.label}
            </Button>
          ))}
        </CardFooter>
      ) : null}
    </Card>
  );
}

type OnboardingContextPanelProps = {
  context: OnboardingContextData | null;
  disabled: boolean;
  isZh: boolean;
  showWorkspaceSelector: boolean;
  onSelectWorkspace: (workspace: OnboardingWorkspaceOption) => void;
  onShowWorkspaceSelector: () => void;
  onPause: () => void;
  onContinue: () => void;
  onAbandon: () => void;
};

function OnboardingContextPanel({
  context,
  disabled,
  isZh,
  showWorkspaceSelector,
  onSelectWorkspace,
  onShowWorkspaceSelector,
  onPause,
  onContinue,
  onAbandon,
}: OnboardingContextPanelProps) {
  const [abandonArmed, setAbandonArmed] = useState(false);
  if (!context) return null;

  const selecting = context.status === "selection_required" || showWorkspaceSelector;
  if (selecting) {
    return (
      <Card size="sm" className={styles.onboardingContextCard}>
        <CardHeader>
          <CardTitle>{isZh ? "选择入驻工作区" : "Choose onboarding workspace"}</CardTitle>
          <CardDescription>
            {isZh ? "后续草稿和正式写入都只会作用于所选工作区。" : "Drafts and writes stay in the selected workspace."}
          </CardDescription>
        </CardHeader>
        <CardFooter className={styles.onboardingWorkspaceActions}>
          {context.workspaces.map((workspace) => (
            <Button
              key={workspace.workspace_id}
              type="button"
              size="sm"
              variant={workspace.workspace_id === context.workspace_id ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onSelectWorkspace(workspace)}
            >
              {workspace.workspace_name || `#${workspace.workspace_id}`}
            </Button>
          ))}
        </CardFooter>
      </Card>
    );
  }

  if (context.status === "completed") return null;
  const hasActions = context.workspaces.length > 1
    || context.status === "in_progress"
    || context.status === "paused";
  if (!hasActions) return null;

  return (
    <Card size="sm" className={styles.onboardingContextCard}>
      <CardHeader className={styles.onboardingContextHeader}>
        <CardAction className={styles.onboardingContextActions}>
          {context.workspaces.length > 1 ? (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onShowWorkspaceSelector}>
              {isZh ? "切换工作区" : "Switch workspace"}
            </Button>
          ) : null}
          {context.status === "in_progress" ? (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onPause}>
              {isZh ? "暂时退出" : "Pause onboarding"}
            </Button>
          ) : null}
          {context.status === "paused" ? (
            <Button type="button" size="sm" disabled={disabled} onClick={onContinue}>
              {isZh ? "继续引导" : "Continue onboarding"}
            </Button>
          ) : null}
          {context.status === "in_progress" || context.status === "paused" ? (
            abandonArmed ? (
              <>
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setAbandonArmed(false)}>
                  {isZh ? "保留进度" : "Keep progress"}
                </Button>
                <Button type="button" size="sm" variant="destructive" disabled={disabled} onClick={() => { setAbandonArmed(false); onAbandon(); }}>
                  <X data-icon="inline-start" aria-hidden="true" />
                  {isZh ? "确认放弃并重置" : "Confirm abandon"}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setAbandonArmed(true)}>
                <X data-icon="inline-start" aria-hidden="true" />
                {isZh ? "放弃引导" : "Abandon onboarding"}
              </Button>
            )
          ) : null}
        </CardAction>
      </CardHeader>
    </Card>
  );
}

type AssistantMessageContentProps = {
  message: RailMessage;
  thinking: string;
  isZh: boolean;
  actionsDisabled: boolean;
  onAction: OnboardingReviewCardProps["onAction"];
  isActiveStep: boolean;
  siteDraft: OnboardingSessionSnapshot["siteDraft"];
  onSiteVariantChange: (variant: OnboardingSiteVariant) => void;
  onSiteDraftChange: (field: OnboardingSiteDraftField, value: string) => void;
  onSiteSubmit: () => void;
  onStepDraftSubmit: (step: "profile" | "leads", answers: Record<string, string>) => void;
  onBackStep: (step: OnboardingCardData["step"]) => void;
  onRestart: () => void;
  onFinish: () => void;
  onShowWorkspaceSelector: () => void;
  canSwitchWorkspace: boolean;
  completionActionsDisabled: boolean;
};

function OnboardingStepTaskContent({
  message,
  thinking,
  isZh,
  actionsDisabled,
  isActiveStep,
  siteDraft,
  onSiteVariantChange,
  onSiteDraftChange,
  onSiteSubmit,
  onStepDraftSubmit,
  onBackStep,
}: Pick<
  AssistantMessageContentProps,
  | "message"
  | "thinking"
  | "isZh"
  | "actionsDisabled"
  | "isActiveStep"
  | "siteDraft"
  | "onSiteVariantChange"
  | "onSiteDraftChange"
  | "onSiteSubmit"
  | "onStepDraftSubmit"
  | "onBackStep"
>) {
  const step = message.onboardingStep;
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [leadRequirement, setLeadRequirement] = useState("");
  const [formError, setFormError] = useState("");
  if (!step) return null;
  const steps = ["profile", "site", "leads"];
  const stepIndex = Math.max(0, steps.indexOf(step.currentStep));

  function submitProfile() {
    if (!profileName.trim()) {
      setFormError(isZh ? "请填写企业名称。" : "Company name is required.");
      return;
    }
    setFormError("");
    onStepDraftSubmit("profile", { name: profileName.trim(), description: profileDescription.trim() });
  }

  function submitLeadRequirement() {
    if (!leadRequirement.trim()) {
      setFormError(isZh ? "请填写获客需求。" : "Lead acquisition requirement is required.");
      return;
    }
    setFormError("");
    onStepDraftSubmit("leads", { requirement_description: leadRequirement.trim() });
  }

  return (
    <div
      className={cn(
        styles.onboardingStepTaskContent,
        step.confirmedStep && styles.onboardingStepTaskConfirmed,
      )}
    >
      {message.text ? (
        <MarkdownRenderer content={message.text} />
      ) : message.isStreaming ? (
        <p>{thinking}</p>
      ) : null}
      {isActiveStep ? (
        <p className={styles.onboardingCredentialHint}>{isZh ? `入驻进度 ${stepIndex + 1} / ${steps.length}` : `Onboarding progress ${stepIndex + 1} / ${steps.length}`}</p>
      ) : null}
      {isActiveStep && step.currentStep === "profile" ? (
        <div className={styles.onboardingSiteDetails}>
          <label>
            <span>{isZh ? "企业名称" : "Company name"}</span>
            <Input value={profileName} maxLength={200} disabled={actionsDisabled} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <label>
            <span>{isZh ? "企业介绍" : "Company description"}</span>
            <Textarea value={profileDescription} maxLength={10000} disabled={actionsDisabled} onChange={(event) => setProfileDescription(event.target.value)} />
          </label>
          {formError ? <small role="alert">{formError}</small> : null}
          <Button type="button" disabled={actionsDisabled} onClick={submitProfile}>{isZh ? "生成确认卡" : "Create review card"}</Button>
        </div>
      ) : null}
      {isActiveStep && step.currentStep === "site" ? (
        <div className={styles.onboardingSiteSelector}>
          <div className={styles.onboardingSiteOptions} role="radiogroup" aria-label={isZh ? "选择站点类型" : "Choose site type"}>
            {([
              ["shopify", isZh ? "Shopify 独立站" : "Shopify store", isZh ? "填写店铺地址和 API 凭证" : "Add store URL and API credentials"],
              ["self_hosted", isZh ? "自建独立站" : "Self-hosted site", isZh ? "补充网址和技术方式" : "Add URL and technology"],
              ["other", isZh ? "其他" : "Other", isZh ? "补充网址和具体类型" : "Add URL and type details"],
            ] as const).map(([variant, label, description]) => (
              <button
                key={variant}
                type="button"
                role="radio"
                aria-checked={siteDraft.variant === variant}
                data-selected={siteDraft.variant === variant || undefined}
                disabled={actionsDisabled}
                onClick={() => onSiteVariantChange(variant)}
              >
                <span className={styles.onboardingSiteOptionCheck} aria-hidden="true">
                  {siteDraft.variant === variant ? <Check /> : null}
                </span>
                <strong>{label}</strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
          {siteDraft.variant ? (
            <div className={styles.onboardingSiteDetails}>
              <label>
                <span>
                  {siteDraft.variant === "shopify"
                    ? (isZh ? "Shopify 店铺 URL" : "Shopify store URL")
                    : (isZh ? "网站地址" : "Website URL")}
                </span>
                <Input
                  type="url"
                  maxLength={500}
                  placeholder="https://example.com"
                  value={siteDraft.url}
                  aria-invalid={Boolean(siteDraft.errors.url)}
                  disabled={actionsDisabled}
                  onChange={(event) => onSiteDraftChange("url", event.target.value)}
                />
                {siteDraft.errors.url ? <small role="alert">{siteDraft.errors.url}</small> : null}
              </label>
              {siteDraft.variant === "shopify" ? (
                <>
                  <label>
                    <span>API Key</span>
                    <Input
                      type="text"
                      maxLength={200}
                      autoComplete="off"
                      spellCheck={false}
                      value={siteDraft.apiKey}
                      aria-invalid={Boolean(siteDraft.errors.apiKey)}
                      disabled={actionsDisabled}
                      onChange={(event) => onSiteDraftChange("apiKey", event.target.value)}
                    />
                    {siteDraft.errors.apiKey ? <small role="alert">{siteDraft.errors.apiKey}</small> : null}
                  </label>
                  <label>
                    <span>Secret Key</span>
                    <Input
                      type="password"
                      maxLength={200}
                      autoComplete="new-password"
                      spellCheck={false}
                      value={siteDraft.apiSecret}
                      aria-invalid={Boolean(siteDraft.errors.apiSecret)}
                      disabled={actionsDisabled}
                      onChange={(event) => onSiteDraftChange("apiSecret", event.target.value)}
                    />
                    {siteDraft.errors.apiSecret ? <small role="alert">{siteDraft.errors.apiSecret}</small> : null}
                  </label>
                  <p className={styles.onboardingCredentialHint}>
                    {isZh
                      ? "凭证不会发送给 AI，仅在确认卡确认后写入 Shopify 配置；同步保持关闭。"
                      : "Credentials are not sent to AI and are saved only after confirmation; sync stays disabled."}
                  </p>
                </>
              ) : (
                <label>
                  <span>
                    {siteDraft.variant === "self_hosted"
                      ? (isZh ? "技术 / 建站方式" : "Technology / platform")
                      : (isZh ? "具体类型说明" : "Type details")}
                  </span>
                  <Textarea
                    maxLength={500}
                    placeholder={siteDraft.variant === "self_hosted" ? "例如：Next.js 自建站" : "例如：第三方 B2B 站点"}
                    value={siteDraft.details}
                    aria-invalid={Boolean(siteDraft.errors.details)}
                    disabled={actionsDisabled}
                    onChange={(event) => onSiteDraftChange("details", event.target.value)}
                  />
                  {siteDraft.errors.details ? <small role="alert">{siteDraft.errors.details}</small> : null}
                </label>
              )}
              <Button type="button" disabled={actionsDisabled} onClick={onSiteSubmit}>
                {siteDraft.variant === "shopify"
                  ? (isZh ? "生成确认卡" : "Create review card")
                  : (isZh ? "AI 优化并生成确认卡" : "Optimize with AI and create card")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {isActiveStep && step.currentStep === "leads" ? (
        <div className={styles.onboardingSiteDetails}>
          <label>
            <span>{isZh ? "总体获客需求" : "Lead acquisition requirement"}</span>
            <Textarea value={leadRequirement} maxLength={4000} disabled={actionsDisabled} onChange={(event) => setLeadRequirement(event.target.value)} />
          </label>
          {formError ? <small role="alert">{formError}</small> : null}
          <Button type="button" disabled={actionsDisabled} onClick={submitLeadRequirement}>{isZh ? "生成确认卡" : "Create review card"}</Button>
        </div>
      ) : null}
      {isActiveStep && step.currentStep !== "profile" ? (
        <div className={styles.onboardingStepFooter}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={actionsDisabled}
            onClick={() => onBackStep(step.currentStep)}
          >
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            {isZh ? "返回上一步" : "Back"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function OnboardingCompletionTaskContent({
  message,
  thinking,
  isZh,
  onRestart,
  onFinish,
  onShowWorkspaceSelector,
  canSwitchWorkspace,
  completionActionsDisabled,
}: Pick<
  AssistantMessageContentProps,
  | "message"
  | "thinking"
  | "isZh"
  | "onRestart"
  | "onFinish"
  | "onShowWorkspaceSelector"
  | "canSwitchWorkspace"
  | "completionActionsDisabled"
>) {
  const [restartArmed, setRestartArmed] = useState(false);

  return (
    <div className={styles.onboardingCompletionTaskContent}>
      {message.text ? (
        <MarkdownRenderer content={message.text} />
      ) : message.isStreaming ? (
        <p>{thinking}</p>
      ) : null}
      <div className={styles.onboardingCompletionActions}>
        {canSwitchWorkspace ? (
          <Button type="button" size="sm" variant="outline" disabled={completionActionsDisabled} onClick={onShowWorkspaceSelector}>
            {isZh ? "切换工作区" : "Switch workspace"}
          </Button>
        ) : null}
        {restartArmed ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={completionActionsDisabled} onClick={() => setRestartArmed(false)}>
              {isZh ? "保留进度" : "Keep progress"}
            </Button>
            <Button type="button" size="sm" disabled={completionActionsDisabled} onClick={() => { setRestartArmed(false); onRestart(); }}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              {isZh ? "确认重新开始" : "Confirm restart"}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={completionActionsDisabled} onClick={() => setRestartArmed(true)}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              {isZh ? "重新开始" : "Restart"}
            </Button>
            <Button type="button" size="sm" disabled={completionActionsDisabled} onClick={onFinish}>
              <Check data-icon="inline-start" aria-hidden="true" />
              {isZh ? "完成引导" : "Finish onboarding"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantMessageContent({
  message,
  thinking,
  isZh,
  actionsDisabled,
  onAction,
  isActiveStep,
  siteDraft,
  onSiteVariantChange,
  onSiteDraftChange,
  onSiteSubmit,
  onStepDraftSubmit,
  onBackStep,
  onRestart,
  onFinish,
  onShowWorkspaceSelector,
  canSwitchWorkspace,
  completionActionsDisabled,
}: AssistantMessageContentProps) {
  return (
    <>
      {message.isStreaming ? (
        <Loader2 size={12} className={styles.streamingIcon} aria-label={thinking} />
      ) : null}
      {message.presentation === "onboarding_step" && message.onboardingStep ? (
        <OnboardingStepTaskContent
          message={message}
          thinking={thinking}
          isZh={isZh}
          actionsDisabled={actionsDisabled}
          isActiveStep={isActiveStep}
          siteDraft={siteDraft}
          onSiteVariantChange={onSiteVariantChange}
          onSiteDraftChange={onSiteDraftChange}
          onSiteSubmit={onSiteSubmit}
          onStepDraftSubmit={onStepDraftSubmit}
          onBackStep={onBackStep}
        />
      ) : message.presentation === "onboarding_complete" ? (
        <OnboardingCompletionTaskContent
          message={message}
          thinking={thinking}
          isZh={isZh}
          onRestart={onRestart}
          onFinish={onFinish}
          onShowWorkspaceSelector={onShowWorkspaceSelector}
          canSwitchWorkspace={canSwitchWorkspace}
          completionActionsDisabled={completionActionsDisabled}
        />
      ) : message.text ? (
        <MarkdownRenderer content={message.text} />
      ) : message.isStreaming && !message.onboardingCard ? (
        <p>{thinking}</p>
      ) : null}
      {message.onboardingCard ? (
        <OnboardingReviewCard
          card={message.onboardingCard}
          disabled={actionsDisabled}
          isZh={isZh}
          onAction={onAction}
        />
      ) : null}
    </>
  );
}

function AssistantAvatar() {
  return (
    <span className={styles.assistantAvatar} aria-hidden="true">
      <Bot size={17} strokeWidth={2.2} />
    </span>
  );
}

function UserAvatar() {
  return (
    <span className={styles.userAvatar} aria-hidden="true">
      <CircleUserRound size={18} strokeWidth={2} />
    </span>
  );
}

function getAssistantMessageBubbleClass(message: RailMessage) {
  const isWelcome = message.presentation === "onboarding_welcome";
  const isStep = message.presentation === "onboarding_step";
  const isComplete = message.presentation === "onboarding_complete";
  return cn(
    styles.messageBubble,
    styles.bubbleLeft,
    (message.onboardingCard || isWelcome || isStep || isComplete) && styles.messageBubbleWithCard,
    isWelcome && styles.onboardingWelcomeCard,
    isStep && styles.onboardingStepTaskCard,
    isComplete && styles.onboardingCompletionCard,
  );
}

export function CommandChatPanel({
  mode = "entry",
  onOpenFullChat,
}: CommandChatPanelProps) {
  // rail/full 模式共享消息，entry 模式独立
  const shareKey = mode === "entry" ? null : "shared";
  const [railMessages, setRailMessages] = useState<RailMessage[]>(shareKey ? _sharedMessages : []);
  const [railDraft, setRailDraft] = useState(shareKey ? _sharedDraft : "");
  const [localIsStreaming, setLocalIsStreaming] = useState(shareKey ? _sharedIsStreaming : false);
  const authUserId = getCurrentAuthUser()?.id ?? null;
  const getSnapshotForAuthUser = useCallback(
    () => onboardingSessionStore.getSnapshotForUser(authUserId),
    [authUserId],
  );
  const onboardingSession = useSyncExternalStore(
    onboardingSessionStore.subscribe,
    getSnapshotForAuthUser,
    getSnapshotForAuthUser,
  );
  const onboardingContext = onboardingSession.context;
  const showWorkspaceSelector = onboardingSession.showWorkspaceSelector;
  const isStreaming = localIsStreaming || onboardingSession.isStreaming;
  const visibleOnboardingMessages = useMemo(
    () => {
      const messages = onboardingSession.dismissed
        ? onboardingSession.messages.filter((message) => message.presentation === "onboarding_exit")
        : onboardingSession.messages;
      return messages.filter((message) => !isLegacyProductsOnboardingMessage(message));
    },
    [onboardingSession.dismissed, onboardingSession.messages],
  );
  const displayMessages = useMemo(
    () => mergeChatMessages(railMessages, visibleOnboardingMessages)
      .filter((message) => !isLegacyProductsOnboardingMessage(message)),
    [railMessages, visibleOnboardingMessages],
  );
  const activeStepMessageId = useMemo(() => {
    const currentStep = onboardingContext?.current_step;
    if (onboardingSession.dismissed || !currentStep || currentStep === "done") return null;
    return [...visibleOnboardingMessages].reverse().find(
      (message) => message.presentation === "onboarding_step"
        && message.onboardingStep?.currentStep === currentStep,
    )?.id ?? null;
  }, [onboardingContext?.current_step, onboardingSession.dismissed, visibleOnboardingMessages]);
  const locale = i18n.language;

  // rail/full 模式时，同步消息到模块级共享状态
  useEffect(() => { if (shareKey) _sharedMessages = railMessages; }, [railMessages, shareKey]);
  useEffect(() => { if (shareKey) _sharedDraft = railDraft; }, [railDraft, shareKey]);
  useEffect(() => { if (shareKey) _sharedIsStreaming = localIsStreaming; }, [localIsStreaming, shareKey]);
  const isZh = locale === "zh-CN";
  const assistantName = isZh ? "AI助理" : "AI Assistant";
  const questions = isZh ? commonQuestions : commonQuestionsEn;
  const thinking = isZh ? "思考中..." : "Thinking...";
  const sendText = isZh ? "发送" : "Send";
  const placeholderText = isZh ? "输入问题，按回车发送..." : "Type a message, press Enter...";
  const continueText = isZh ? "继续提问..." : "Continue asking...";
  const openFullText = isZh ? "打开完整对话" : "Open Full Chat";
  const fullIntro = isZh
    ? "输入问题开始对话。AI 助理可以帮您查询线索数据。"
    : "Type a message to start. The AI assistant can help you query lead data.";
  const requestFailed = isZh ? "请求失败，请重试" : "Request failed, please try again";

  const isStreamingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // 自动定位到最新回复；避免已更新的历史审核卡把线程拉回上方。
  useEffect(() => {
    const el = chatContainerRef.current;
    const latestMessage = displayMessages[displayMessages.length - 1];
    if (!el || !latestMessage) return;

    const frameId = window.requestAnimationFrame(() => {
      if (
        latestMessage.id === "onboarding-auto-resume"
        && latestMessage.presentation === "onboarding_welcome"
      ) {
        el.scrollTop = 0;
        return;
      }

      const latestMessageElement = el.querySelector<HTMLElement>(
        `[data-chat-message-id="${latestMessage.id}"]`,
      );
      if (latestMessageElement) {
        const containerRect = el.getBoundingClientRect();
        const messageRect = latestMessageElement.getBoundingClientRect();
        const targetTop = el.scrollTop + messageRect.top - containerRect.top - 8;
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));
        return;
      }
      el.scrollTop = el.scrollHeight;

    });
    return () => window.cancelAnimationFrame(frameId);
  }, [displayMessages]);

  const sendChatRequest = useCallback(async (
    request: ChatRequest,
    visibleUserText: string,
    options?: { silent?: boolean },
  ) => {
    const trimmed = visibleUserText.trim();
    const silent = options?.silent === true;
    if ((!trimmed && !silent) || isStreamingRef.current) return;

    isStreamingRef.current = true;
    setLocalIsStreaming(true);

    const timestamp = Date.now();
    const assistantId = `assistant-${timestamp}`;

    let assistantHasContent = false;
    setRailMessages((prev) => [
      ...prev,
      ...(silent ? [] : [{
        id: `user-${timestamp}`,
        speaker: "user" as const,
        text: trimmed,
        order: nextMessageOrder(),
      }]),
      {
        id: assistantId,
        speaker: "assistant",
        text: "",
        order: nextMessageOrder(),
        isStreaming: true,
      },
    ]);
    setRailDraft("");

    try {
      // 流式接收 SSE
      for await (const event of streamChat(request)) {
        switch (event.type) {
          case "text":
            assistantHasContent = true;
            setRailMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, text: m.text + event.data.text }
                  : m,
              ),
            );
            break;

          case "tool_use":
            // 静默处理，不显示
            break;

          case "tool_result":
            // 静默处理，不显示
            break;

          case "onboarding_card":
            assistantHasContent = true;
            setRailMessages((prev) => {
              let matchedExistingCard = false;
              const updated = prev.map((message) => {
                const existingCard = message.onboardingCard;
                if (existingCard && existingCard.card_id === event.data.replaces_card_id) {
                  return {
                    ...message,
                    onboardingCard: {
                      ...existingCard,
                      status: "superseded" as const,
                      actions: [],
                    },
                  };
                }
                if (existingCard && existingCard.card_id === event.data.card_id) {
                  matchedExistingCard = true;
                  return { ...message, onboardingCard: event.data };
                }
                return message;
              });
              if (matchedExistingCard) return updated;
              return updated.map((message) =>
                message.id === assistantId
                  ? { ...message, onboardingCard: event.data }
                  : message,
              );
            });
            break;

          case "onboarding_context":
            {
              const identity = onboardingSessionStore.getActiveIdentity();
              if (identity) {
                onboardingSessionStore.storeWorkspaceId(identity, event.data.workspace_id);
                updateOnboardingSession((snapshot) => ({
                  ...snapshot,
                  context: event.data,
                  showWorkspaceSelector: event.data.status === "selection_required",
                }), identity);
              }
            }
            break;

          case "done":
            setRailMessages((prev) =>
              assistantHasContent
                ? prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m,
                  )
                : prev.filter((m) => m.id !== assistantId),
            );
            break;

          case "error":
            assistantHasContent = true;
            setRailMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, text: `❌ ${event.data.message}`, isStreaming: false }
                  : m,
              ),
            );
            break;
        }
      }
    } catch {
      setRailMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: requestFailed, isStreaming: false }
            : m,
        ),
      );
    } finally {
      isStreamingRef.current = false;
      setLocalIsStreaming(false);
    }
  }, [requestFailed]);

  const sendRailMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const onboardingActive = !onboardingSession.dismissed && (
      onboardingContext?.status === "not_started"
      || onboardingContext?.status === "in_progress"
    );
    const onboardingRequest = onboardingActive || isOnboardingStartText(trimmed);
    const workspaceId = onboardingActive || isOnboardingStartText(trimmed)
      ? onboardingContext?.workspace_id ?? readOnboardingWorkspaceId()
      : undefined;
    setRailDraft("");
    if (shareKey) _sharedDraft = "";
    const request = { message: trimmed, ...(workspaceId ? { workspace_id: workspaceId } : {}) };
    if (onboardingRequest) {
      void sendOnboardingSessionRequest(request, trimmed);
    } else {
      void sendChatRequest(request, trimmed);
    }
  }, [onboardingContext, onboardingSession.dismissed, sendChatRequest, shareKey]);

  const handleOnboardingAction = useCallback((
    card: OnboardingCardData,
    action: OnboardingCardAction,
  ) => {
    const isShopifyConfirm = action.type === "confirm_onboarding_card"
      && isShopifyOnboardingCard(card);
    const siteDraft = onboardingSessionStore.getActiveSnapshot().siteDraft;
    if (isShopifyConfirm) {
      const draft = siteDraft.variant === "shopify"
        ? siteDraft
        : { ...createEmptyOnboardingSiteDraft(card.step === "site" ? onboardingContext?.workspace_id ?? null : null), variant: "shopify" as const };
      const errors = validateOnboardingSiteDraft(draft, isZh);
      if (Object.keys(errors).length > 0) {
        updateOnboardingSession((snapshot) => ({
          ...snapshot,
          siteDraft: { ...draft, errors },
        }));
        return;
      }
    }
    const actionText = isZh
      ? `${action.label}：${card.title}`
      : `${action.label}: ${card.title}`;
    void sendOnboardingSessionRequest(
      {
        action: {
          type: action.type,
          card_id: card.card_id,
          step: card.step,
          resolution: action.resolution,
          confirmed: action.confirmed,
          ...(isShopifyConfirm ? {
            shopify_store_url: siteDraft.url.trim(),
            shopify_api_key: siteDraft.apiKey.trim(),
            shopify_api_secret_key: siteDraft.apiSecret.trim(),
          } : {}),
        },
        workspace_id: onboardingContext?.workspace_id ?? readOnboardingWorkspaceId(),
      },
      actionText,
    );
  }, [isZh, onboardingContext]);

  const handleSiteDraftChange = useCallback((field: OnboardingSiteDraftField, value: string) => {
    updateOnboardingSession((snapshot) => ({
      ...snapshot,
      siteDraft: {
        ...snapshot.siteDraft,
        [field]: value,
        errors: { ...snapshot.siteDraft.errors, [field]: undefined },
      },
    }));
  }, []);

  const submitSiteSelection = useCallback((variant: OnboardingSiteVariant) => {
    const workspaceId = onboardingContext?.workspace_id ?? readOnboardingWorkspaceId();
    if (!workspaceId) return;
    const draft = onboardingSessionStore.getActiveSnapshot().siteDraft;
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspaceId,
        action: {
          type: "select_onboarding_site",
          step: "site",
          site_variant: variant,
          ...(variant === "shopify" ? {
            shopify_store_url: draft.url.trim(),
            shopify_api_key: draft.apiKey.trim(),
            shopify_api_secret_key: draft.apiSecret.trim(),
          } : {
            site_url: draft.url.trim(),
            site_details: draft.details.trim(),
          }),
        },
      },
      isZh
        ? `选择站点类型：${variant === "shopify" ? "Shopify 独立站" : variant === "self_hosted" ? "自建独立站" : "其他"}`
        : `Choose site type: ${variant}`,
    );
  }, [isZh, onboardingContext?.workspace_id]);

  const handleSiteVariantChange = useCallback((variant: OnboardingSiteVariant) => {
    const workspaceId = onboardingContext?.workspace_id ?? readOnboardingWorkspaceId() ?? null;
    updateOnboardingSession((snapshot) => ({
      ...snapshot,
      siteDraft: {
        ...(snapshot.siteDraft.workspaceId === workspaceId
          ? snapshot.siteDraft
          : createEmptyOnboardingSiteDraft(workspaceId)),
        workspaceId,
        variant,
        errors: {},
      },
    }));
  }, [onboardingContext?.workspace_id]);

  const handleSiteSubmit = useCallback(() => {
    const draft = onboardingSessionStore.getActiveSnapshot().siteDraft;
    if (!draft.variant) return;
    const errors = validateOnboardingSiteDraft(draft, isZh);
    if (Object.keys(errors).length > 0) {
      updateOnboardingSession((snapshot) => ({
        ...snapshot,
        siteDraft: { ...snapshot.siteDraft, errors },
      }));
      return;
    }
    submitSiteSelection(draft.variant);
  }, [isZh, submitSiteSelection]);

  const handleStepDraftSubmit = useCallback((step: "profile" | "leads", answers: Record<string, string>) => {
    const workspaceId = onboardingContext?.workspace_id ?? readOnboardingWorkspaceId();
    if (!workspaceId) return;
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspaceId,
        action: { type: "save_onboarding_draft", step, answers },
      },
      isZh ? "生成入驻确认卡" : "Create onboarding review card",
    );
  }, [isZh, onboardingContext?.workspace_id]);

  const handleBackOnboardingStep = useCallback((step: OnboardingCardData["step"]) => {
    const workspaceId = onboardingContext?.workspace_id ?? readOnboardingWorkspaceId();
    if (!workspaceId || step === "profile") return;
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspaceId,
        action: { type: "back_onboarding_step", step },
      },
      isZh ? "返回上一步" : "Back to previous step",
    );
  }, [isZh, onboardingContext?.workspace_id]);

  const handleSelectWorkspace = useCallback((workspace: OnboardingWorkspaceOption) => {
    setOnboardingWorkspaceSelectorVisible(false);
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspace.workspace_id,
        action: { type: "select_onboarding_workspace" },
      },
      isZh ? `选择工作区：${workspace.workspace_name}` : `Select workspace: ${workspace.workspace_name}`,
    );
  }, [isZh]);

  const handleRestartOnboarding = useCallback(() => {
    const workspaceId = onboardingContext?.workspace_id;
    if (!workspaceId) return;
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspaceId,
        action: { type: "restart_onboarding", confirmed: true },
      },
      isZh ? "确认重新开始入驻引导" : "Confirm restart onboarding",
    );
  }, [isZh, onboardingContext]);

  const handleFinishOnboarding = useCallback(() => {
    const workspaceId = onboardingContext?.workspace_id;
    if (!workspaceId) return;
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspaceId,
        action: { type: "finish_onboarding", confirmed: true },
      },
      "",
      { silent: true },
    );
  }, [onboardingContext?.workspace_id]);

  const handlePauseOnboarding = useCallback(() => {
    const workspaceId = onboardingContext?.workspace_id;
    if (!workspaceId) return;
    void sendOnboardingSessionRequest(
      { workspace_id: workspaceId, action: { type: "pause_onboarding" } },
      isZh ? "暂时退出入驻引导" : "Pause onboarding",
    );
  }, [isZh, onboardingContext]);

  const handleContinueOnboarding = useCallback(() => {
    const workspaceId = onboardingContext?.workspace_id;
    if (!workspaceId) return;
    void sendOnboardingSessionRequest(
      { workspace_id: workspaceId, action: { type: "continue_onboarding" } },
      isZh ? "继续入驻引导" : "Continue onboarding",
    );
  }, [isZh, onboardingContext]);

  const handleAbandonOnboarding = useCallback(() => {
    const workspaceId = onboardingContext?.workspace_id;
    if (!workspaceId) return;
    void sendOnboardingSessionRequest(
      {
        workspace_id: workspaceId,
        action: { type: "abandon_onboarding", confirmed: true },
      },
      isZh ? "确认放弃并重置入驻引导" : "Confirm abandon onboarding",
    );
  }, [isZh, onboardingContext]);

  useEffect(() => {
    if (!authUserId) return;
    onboardingSessionStore.activate(authUserId);
    void ensureOnboardingAutoResume(authUserId);
  }, [authUserId]);

  const onboardingContextPanel = (
    <OnboardingContextPanel
      context={onboardingContext}
      disabled={isStreaming}
      isZh={isZh}
      showWorkspaceSelector={showWorkspaceSelector}
      onSelectWorkspace={handleSelectWorkspace}
      onShowWorkspaceSelector={() => setOnboardingWorkspaceSelectorVisible(true)}
      onPause={handlePauseOnboarding}
      onContinue={handleContinueOnboarding}
      onAbandon={handleAbandonOnboarding}
    />
  );
  const onboardingActionsDisabled = isStreaming
    || onboardingContext?.status !== "in_progress"
    || ["processing", "result_unknown"].includes(onboardingContext?.execution?.status ?? "");
  const completionNotice = onboardingSession.completionNotice ? (
    <div className={styles.onboardingCompletionNotice} role="status" aria-live="polite">
      <Check aria-hidden="true" />
      <span>{onboardingSession.completionNotice}</span>
    </div>
  ) : null;

  function handleRailKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      sendRailMessage(railDraft);
    }
  }

  if (mode === "rail") {
    return (
      <section className={styles.chatRailPanel} aria-label={isZh ? "右侧对话辅助栏" : "Chat side panel"}>
        <div className={styles.chatAssistantHead}>
          <AssistantAvatar />
          <strong>{assistantName}</strong>
        </div>

        {onboardingContextPanel}
        {completionNotice}

        {displayMessages.length === 0 ? (
          <div className={styles.railQuestionList} aria-label={isZh ? "常见问题" : "Common questions"}>
            {questions.map((question) => (
              <button key={question} type="button" onClick={() => sendRailMessage(question)}>
                {question}
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.chatRailThread} aria-label={isZh ? "右侧对话记录" : "Chat history"} ref={chatContainerRef}>
          {displayMessages.filter((m) => m.speaker !== "tool").map((message) => (
            <div
              key={message.id}
              data-chat-message-id={message.id}
              className={cn(
                message.speaker === "assistant" ? styles.messageRowLeft : styles.messageRowRight,
                message.presentation === "onboarding_welcome" && styles.onboardingWelcomeRow,
                message.presentation === "onboarding_step" && styles.onboardingStepTaskRow,
                message.presentation === "onboarding_complete" && styles.onboardingCompletionRow,
              )}
            >
              {message.speaker === "assistant" ? (
                <>
                  <AssistantAvatar />
                  <div className={getAssistantMessageBubbleClass(message)}>
                    <AssistantMessageContent
                      message={message}
                      thinking={thinking}
                      isZh={isZh}
                      actionsDisabled={onboardingActionsDisabled}
                      isActiveStep={message.id === activeStepMessageId}
                      siteDraft={onboardingSession.siteDraft}
                      onSiteVariantChange={handleSiteVariantChange}
                      onSiteDraftChange={handleSiteDraftChange}
                      onSiteSubmit={handleSiteSubmit}
                      onStepDraftSubmit={handleStepDraftSubmit}
                      onBackStep={handleBackOnboardingStep}
                      onAction={handleOnboardingAction}
                      onRestart={handleRestartOnboarding}
                      onFinish={handleFinishOnboarding}
                      onShowWorkspaceSelector={() => setOnboardingWorkspaceSelectorVisible(true)}
                      canSwitchWorkspace={(onboardingContext?.workspaces.length ?? 0) > 1}
                      completionActionsDisabled={isStreaming}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.messageBubble + " " + styles.bubbleRight}>
                    <p>{message.text}</p>
                  </div>
                  <UserAvatar />
                </>
              )}
            </div>
          ))}
        </div>

        <div className={styles.railComposer}>
          <textarea
            ref={composerRef}
            aria-label={isZh ? "向 AI 助理提问" : "Ask AI assistant"}
            placeholder={continueText}
            value={railDraft}
            onChange={(event) => setRailDraft(event.target.value)}
            onKeyDown={handleRailKeyDown}
          />
          <Button
            type="button"
            aria-label={isStreaming ? thinking : sendText}
            title={isStreaming ? thinking : sendText}
            className={styles.chatSendButton}
            size="icon"
            onClick={() => sendRailMessage(railDraft)}
            disabled={isStreaming || !railDraft.trim()}
          >
            {isStreaming ? (
              <Loader2 className={styles.sendSpinner} aria-hidden="true" />
            ) : (
              <SendHorizonal data-icon="inline-start" aria-hidden="true" />
            )}
          </Button>
        </div>

        <button type="button" className={styles.railOpenButton} onClick={onOpenFullChat}>
          {openFullText}
        </button>
      </section>
    );
  }

  if (mode === "full") {
    return (
      <section className={styles.chatPagePanel} aria-label={isZh ? "完整对话页面" : "Full chat page"}>
        {onboardingContextPanel}
        {completionNotice}
        <div className={styles.chatThread} ref={chatContainerRef}>
          {displayMessages.length === 0 ? (
            <p className={styles.chatRailIntro}>{fullIntro}</p>
          ) : (
            displayMessages.filter((m) => m.speaker !== "tool").map((message) => (
              <div
                key={message.id}
                data-chat-message-id={message.id}
                className={cn(
                  message.speaker === "assistant" ? styles.messageRowLeft : styles.messageRowRight,
                  message.presentation === "onboarding_welcome" && styles.onboardingWelcomeRow,
                  message.presentation === "onboarding_step" && styles.onboardingStepTaskRow,
                  message.presentation === "onboarding_complete" && styles.onboardingCompletionRow,
                )}
              >
                {message.speaker === "assistant" ? (
                  <>
                    <AssistantAvatar />
                    <div className={getAssistantMessageBubbleClass(message)}>
                      <AssistantMessageContent
                        message={message}
                        thinking={thinking}
                        isZh={isZh}
                        actionsDisabled={onboardingActionsDisabled}
                        isActiveStep={message.id === activeStepMessageId}
                        siteDraft={onboardingSession.siteDraft}
                        onSiteVariantChange={handleSiteVariantChange}
                        onSiteDraftChange={handleSiteDraftChange}
                        onSiteSubmit={handleSiteSubmit}
                        onStepDraftSubmit={handleStepDraftSubmit}
                        onBackStep={handleBackOnboardingStep}
                        onAction={handleOnboardingAction}
                        onRestart={handleRestartOnboarding}
                        onFinish={handleFinishOnboarding}
                        onShowWorkspaceSelector={() => setOnboardingWorkspaceSelectorVisible(true)}
                        canSwitchWorkspace={(onboardingContext?.workspaces.length ?? 0) > 1}
                        completionActionsDisabled={isStreaming}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.messageBubble + " " + styles.bubbleRight}>
                      <p>{message.text}</p>
                    </div>
                    <UserAvatar />
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className={styles.chatComposer}>
          <Textarea
            ref={composerRef}
            aria-label={isZh ? "向 AI 助理提问" : "Ask AI assistant"}
            placeholder={continueText}
            value={railDraft}
            onChange={(event) => setRailDraft(event.target.value)}
            onKeyDown={handleRailKeyDown}
            disabled={isStreaming}
          />
          <Button
            type="button"
            aria-label={isStreaming ? thinking : sendText}
            title={isStreaming ? thinking : sendText}
            className={styles.chatSendButton}
            size="icon"
            onClick={() => sendRailMessage(railDraft)}
            disabled={isStreaming || !railDraft.trim()}
          >
            {isStreaming ? (
              <Loader2 className={styles.sendSpinner} aria-hidden="true" />
            ) : (
              <SendHorizonal data-icon="inline-start" aria-hidden="true" />
            )}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.chatEntryPanel} aria-label={isZh ? "首页 AI 助理入口" : "Home AI assistant"}>
      {onboardingContextPanel}
      {completionNotice}
      {/* 没消息时显示推荐问题 */}
      {displayMessages.length === 0 ? (
        <div className={styles.questionChips} aria-label={isZh ? "常见问题" : "Common questions"}>
          {questions.map((question) => (
            <button key={question} type="button" onClick={() => sendRailMessage(question)}>
              {question}
            </button>
          ))}
        </div>
      ) : (
        /* 有消息时显示对话线程 */
        <div className={styles.entryChatThread} aria-label={isZh ? "对话记录" : "Chat history"} ref={chatContainerRef}>
          {displayMessages.filter((m) => m.speaker !== "tool").map((message) => (
            <div
              key={message.id}
              data-chat-message-id={message.id}
              className={cn(
                message.speaker === "assistant" ? styles.messageRowLeft : styles.messageRowRight,
                message.presentation === "onboarding_welcome" && styles.onboardingWelcomeRow,
                message.presentation === "onboarding_step" && styles.onboardingStepTaskRow,
                message.presentation === "onboarding_complete" && styles.onboardingCompletionRow,
              )}
            >
              {message.speaker === "assistant" ? (
                <>
                  <AssistantAvatar />
                  <div className={getAssistantMessageBubbleClass(message)}>
                    <AssistantMessageContent
                      message={message}
                      thinking={thinking}
                      isZh={isZh}
                      actionsDisabled={onboardingActionsDisabled}
                      isActiveStep={message.id === activeStepMessageId}
                      siteDraft={onboardingSession.siteDraft}
                      onSiteVariantChange={handleSiteVariantChange}
                      onSiteDraftChange={handleSiteDraftChange}
                      onSiteSubmit={handleSiteSubmit}
                      onStepDraftSubmit={handleStepDraftSubmit}
                      onBackStep={handleBackOnboardingStep}
                      onAction={handleOnboardingAction}
                      onRestart={handleRestartOnboarding}
                      onFinish={handleFinishOnboarding}
                      onShowWorkspaceSelector={() => setOnboardingWorkspaceSelectorVisible(true)}
                      canSwitchWorkspace={(onboardingContext?.workspaces.length ?? 0) > 1}
                      completionActionsDisabled={isStreaming}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.messageBubble + " " + styles.bubbleRight}>
                    <p>{message.text}</p>
                  </div>
                  <UserAvatar />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.chatInputRow}>
        <Textarea
          ref={composerRef}
          aria-label={isZh ? "向 AI 助理提问" : "Ask AI assistant"}
          placeholder={displayMessages.length > 0 ? continueText : placeholderText}
          value={railDraft}
          onChange={(event) => setRailDraft(event.target.value)}
          onKeyDown={handleRailKeyDown}
          disabled={isStreaming}
        />
        <Button
          type="button"
          aria-label={isStreaming ? thinking : sendText}
          title={isStreaming ? thinking : sendText}
          className={styles.chatSendButton}
          size="icon"
          onClick={() => { if (railDraft.trim()) sendRailMessage(railDraft); }}
          disabled={isStreaming || !railDraft.trim()}
        >
          {isStreaming ? (
            <Loader2 className={styles.sendSpinner} aria-hidden="true" />
          ) : (
            <SendHorizonal data-icon="inline-start" aria-hidden="true" />
          )}
        </Button>
      </div>
    </section>
  );
}
