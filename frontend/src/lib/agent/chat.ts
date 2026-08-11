import { TOKEN_COOKIE_NAME } from "@/lib/auth/core";

function getToken(): string | undefined {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE_NAME}=([^;]*)`)
  );
  return match?.[1];
}

export interface SSETextEvent {
  type: "text";
  data: { text: string };
}

export interface SSEToolUseEvent {
  type: "tool_use";
  data: { tool: string; input: Record<string, unknown> };
}

export interface SSEToolResultEvent {
  type: "tool_result";
  data: { tool: string; result: string };
}

export interface SSEStatusEvent {
  type: "status";
  data: { state: string };
}

export interface SSEConversationEvent {
  type: "conversation";
  data: { conversation_id: string };
}

export type OnboardingActionType =
  | "resume_onboarding"
  | "select_onboarding_workspace"
  | "restart_onboarding"
  | "finish_onboarding"
  | "pause_onboarding"
  | "continue_onboarding"
  | "abandon_onboarding"
  | "resolve_onboarding_execution"
  | "confirm_onboarding_card"
  | "cancel_onboarding_card"
  | "finish_products_step"
  | "save_onboarding_draft"
  | "select_onboarding_site"
  | "back_onboarding_step";

export type OnboardingSiteVariant = "shopify" | "self_hosted" | "other";

export interface OnboardingCardField {
  key: string;
  label: string;
  value: string;
}

export interface OnboardingCardAction {
  type: OnboardingActionType;
  label: string;
  variant: "primary" | "secondary";
  resolution?: "mark_applied" | "retry";
  confirmed?: boolean;
}

export interface OnboardingCardData {
  card_id: string;
  replaces_card_id?: string;
  step: "profile" | "site" | "products" | "leads";
  kind: "profile" | "site" | "product" | "product_import" | "products_overview" | "leads_readiness" | "lead_requirement";
  title: string;
  description: string;
  fields: OnboardingCardField[];
  status:
    | "draft"
    | "processing"
    | "failed"
    | "result_unknown"
    | "applied"
    | "cancelled"
    | "superseded";
  actions: OnboardingCardAction[];
  warning?: string;
}

export interface SSEOnboardingCardEvent {
  type: "onboarding_card";
  data: OnboardingCardData;
}

export interface OnboardingWorkspaceOption {
  workspace_id: number;
  workspace_name: string;
}

export interface OnboardingContextData {
  workspace_id: number | null;
  workspace_name: string;
  workspaces: OnboardingWorkspaceOption[];
  status: "selection_required" | "not_started" | "in_progress" | "paused" | "completed";
  current_step: OnboardingCardData["step"] | "done" | null;
  completed_steps: OnboardingCardData["step"][];
  step_statuses: Partial<Record<OnboardingCardData["step"], string>>;
  execution: {
    card_id?: string;
    kind?: string;
    status?: "processing" | "failed" | "result_unknown";
    started_at?: string;
    updated_at?: string;
  } | null;
  completion_acknowledged: boolean;
}

export interface SSEOnboardingContextEvent {
  type: "onboarding_context";
  data: OnboardingContextData;
}

export interface SSEDoneEvent {
  type: "done";
  data: { state: string };
}

export interface SSEErrorEvent {
  type: "error";
  data: { message: string; code?: string; retryable?: boolean };
}

export type SSEEvent =
  | SSETextEvent
  | SSEToolUseEvent
  | SSEToolResultEvent
  | SSEStatusEvent
  | SSEConversationEvent
  | SSEOnboardingCardEvent
  | SSEOnboardingContextEvent
  | SSEDoneEvent
  | SSEErrorEvent;

export interface ChatRequest {
  message?: string;
  conversation_id?: string;
  workspace_id?: number;
  action?: {
    type: OnboardingActionType;
    card_id?: string;
    step?: OnboardingCardData["step"];
    resolution?: "mark_applied" | "retry";
    confirmed?: boolean;
    site_variant?: OnboardingSiteVariant;
    site_url?: string;
    site_details?: string;
    shopify_store_url?: string;
    shopify_api_key?: string;
    shopify_api_secret_key?: string;
    answers?: Record<string, string>;
  };
}


/**
 * 流式对话 — 返回 AsyncGenerator，逐条 yield SSE 事件
 */
export async function* streamChat(
  request: string | ChatRequest,
): AsyncGenerator<SSEEvent> {
  const token = getToken();
  const body = typeof request === "string" ? { message: request } : request;
  const res = await fetch("/api/supplier/agent/chat/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "请求失败" }));
    yield { type: "error", data: { message: err.message || "请求失败" } };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: "error", data: { message: "无法读取响应流" } };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ") && eventType) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { type: eventType as SSEEvent["type"], data };
        } catch {
          // 解析失败，跳过
        }
        eventType = "";
      }
    }
  }
}
