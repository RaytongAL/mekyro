import assert from "node:assert/strict";
import test from "node:test";

import {
  createOnboardingSessionStore,
  isLegacyProductsOnboardingMessage,
  onboardingWorkspaceSessionKey,
} from "../src/lib/agent/onboarding-session-store.ts";
import { parseAuthFromJwt } from "../src/lib/auth/core.ts";
import {
  createEmptyOnboardingSiteDraft,
  validateOnboardingSiteDraft,
} from "../src/lib/agent/onboarding-site-draft.ts";

function jwtWithPayload(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

test("SimpleJWT 字符串 user_id 会规范化为稳定数字身份", () => {
  const auth = parseAuthFromJwt(jwtWithPayload({
    exp: Math.floor(Date.now() / 1000) + 60,
    iat: Math.floor(Date.now() / 1000),
    user_id: "202",
    username: "supplier-202",
    nickname: "Supplier 202",
    is_superuser: false,
  }));

  assert.equal(auth?.id, 202);
});

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}

function createStore(storage = createStorage()) {
  return {
    storage,
    store: createOnboardingSessionStore({ getStorage: () => storage }),
  };
}

test("同一用户的自动恢复在多次挂载时只启动一次", async () => {
  const { store } = createStore();
  let startCount = 0;

  const start = async () => {
    startCount += 1;
  };
  const promises = [
    store.ensureAutoResume(101, start),
    store.ensureAutoResume(101, start),
    store.ensureAutoResume(101, start),
    store.ensureAutoResume(101, start),
  ];

  await Promise.all(promises);
  assert.equal(startCount, 1);
  assert.deepEqual(store.getActiveIdentity(), { userId: 101, generation: 1 });
});

test("切换用户会重置完整 onboarding 快照并创建新恢复请求", async () => {
  const { store } = createStore();
  const identityA = store.activate(201);
  assert.ok(identityA);
  store.update(identityA, (snapshot) => ({
    ...snapshot,
    context: {
      workspace_id: 91,
      workspace_name: "A 工作区",
      workspaces: [{ workspace_id: 91, workspace_name: "A 工作区" }],
      status: "completed",
      current_step: "done",
      completed_steps: ["profile", "site", "leads"],
      step_statuses: {},
      execution: null,
      completion_acknowledged: true,
    },
    dismissed: true,
    completionNotice: "A 已完成",
    messages: [{
      id: "a-pending",
      speaker: "assistant",
      text: "A 的消息",
      onboardingCard: {
        card_id: "a-card",
        step: "profile",
        kind: "profile",
        title: "A 卡片",
        description: "A",
        fields: [],
        status: "draft",
        actions: [],
      },
    }],
    isStreaming: true,
    showWorkspaceSelector: true,
    siteDraft: {
      workspaceId: 91,
      variant: "self_hosted",
      url: "https://a.example",
      details: "A 的草稿",
      apiKey: "api-key-a",
      apiSecret: "secret-a",
      errors: { url: "A 的错误" },
    },
  }));

  let startCount = 0;
  let releaseA;
  const pendingA = new Promise((resolve) => { releaseA = resolve; });
  store.ensureAutoResume(201, async () => {
    startCount += 1;
    await pendingA;
  });

  const identityB = store.activate(202);
  assert.ok(identityB);
  store.ensureAutoResume(202, async () => {
    startCount += 1;
  });
  await Promise.resolve();

  assert.equal(startCount, 2);
  assert.deepEqual(store.getSnapshotForUser(202), {
    context: null,
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
  });
  assert.equal(store.getSnapshotForUser(201).messages.length, 0);
  releaseA();
});

test("上一用户的迟到异步更新不会污染当前用户", () => {
  const { store } = createStore();
  const identityA = store.activate(301);
  assert.ok(identityA);
  const identityB = store.activate(302);
  assert.ok(identityB);

  const updated = store.update(identityA, (snapshot) => ({
    ...snapshot,
    dismissed: true,
    messages: [{ id: "stale-a", speaker: "assistant", text: "旧响应" }],
  }));

  assert.equal(updated, false);
  assert.equal(store.getSnapshotForUser(302).dismissed, false);
  assert.deepEqual(store.getSnapshotForUser(302).messages, []);
});

test("Workspace 选择按 user_id 命名空间隔离", () => {
  const { store, storage } = createStore();
  storage.setItem("mekyro:onboarding-workspace-id", "999");

  const identityA = store.activate(401);
  assert.ok(identityA);
  store.storeWorkspaceId(identityA, 41);
  const identityB = store.activate(402);
  assert.ok(identityB);
  store.storeWorkspaceId(identityB, 42);

  assert.equal(store.readWorkspaceId(401), 41);
  assert.equal(store.readWorkspaceId(402), 42);
  assert.equal(storage.getItem(onboardingWorkspaceSessionKey(401)), "41");
  assert.equal(storage.getItem(onboardingWorkspaceSessionKey(402)), "42");
  assert.equal(storage.getItem("mekyro:onboarding-workspace-id"), null);
});

test("退出清理当前用户 Workspace、Promise 和内存状态", async () => {
  const { store, storage } = createStore();
  const identity = store.activate(501);
  assert.ok(identity);
  store.storeWorkspaceId(identity, 51);
  store.update(identity, (snapshot) => ({
    ...snapshot,
    dismissed: true,
    completionNotice: "完成",
    messages: [{ id: "before-logout", speaker: "assistant", text: "旧消息" }],
  }));
  let startCount = 0;
  await store.ensureAutoResume(501, async () => { startCount += 1; });

  store.clearForLogout();

  assert.equal(store.getActiveIdentity(), null);
  assert.equal(storage.getItem(onboardingWorkspaceSessionKey(501)), null);
  assert.deepEqual(store.getSnapshotForUser(501).messages, []);

  await store.ensureAutoResume(501, async () => { startCount += 1; });
  assert.equal(startCount, 2);
});

test("认证身份不可用时不会创建自动恢复 Promise", () => {
  const { store } = createStore();
  let startCount = 0;

  const promise = store.ensureAutoResume(null, async () => { startCount += 1; });

  assert.equal(promise, null);
  assert.equal(startCount, 0);
  assert.equal(store.getActiveIdentity(), null);
});

test("旧商品卡和商品步骤消息不会成为前端可见的 active onboarding 消息", () => {
  assert.equal(isLegacyProductsOnboardingMessage({
    id: "legacy-card",
    speaker: "assistant",
    text: "旧商品卡",
    onboardingCard: {
      card_id: "legacy-product-card",
      step: "products",
      kind: "products_overview",
      title: "旧商品步骤",
      description: "旧数据",
      fields: [],
      status: "draft",
      actions: [{ type: "finish_products_step", label: "完成商品步骤" }],
    },
  }), true);
  assert.equal(isLegacyProductsOnboardingMessage({
    id: "legacy-step",
    speaker: "assistant",
    text: "旧商品步骤",
    presentation: "onboarding_step",
    onboardingStep: { currentStep: "products", completedSteps: ["profile", "site"] },
  }), true);
  assert.equal(isLegacyProductsOnboardingMessage({
    id: "lead-step",
    speaker: "assistant",
    text: "线索步骤",
    presentation: "onboarding_step",
    onboardingStep: { currentStep: "leads", completedSteps: ["profile", "site"] },
  }), false);
});

test("Shopify 表单要求 URL、API Key 和 Secret Key", () => {
  const emptyDraft = {
    ...createEmptyOnboardingSiteDraft(601),
    variant: "shopify",
  };
  assert.deepEqual(validateOnboardingSiteDraft(emptyDraft, true), {
    url: "请填写网站地址",
    apiKey: "请填写 API Key",
    apiSecret: "请填写 Secret Key",
  });

  const validDraft = {
    ...emptyDraft,
    url: "https://demo.myshopify.com",
    apiKey: "client-id",
    apiSecret: "client-secret",
  };
  assert.deepEqual(validateOnboardingSiteDraft(validDraft, true), {});
});

test("自然语言站点说明需要填写，Shopify 凭证不参与该校验", () => {
  const draft = {
    ...createEmptyOnboardingSiteDraft(602),
    variant: "self_hosted",
    url: "https://example.com",
    apiKey: "不应参与",
    apiSecret: "不应参与",
  };
  assert.deepEqual(validateOnboardingSiteDraft(draft, true), {
    details: "请填写类型说明",
  });
});

test("Shopify 凭证仅保存在页面内存，刷新后的 store 不恢复凭证", () => {
  const storage = createStorage();
  const first = createStore(storage).store;
  const firstIdentity = first.activate(603);
  assert.ok(firstIdentity);
  first.storeWorkspaceId(firstIdentity, 63);
  first.update(firstIdentity, (snapshot) => ({
    ...snapshot,
    siteDraft: {
      ...createEmptyOnboardingSiteDraft(63),
      variant: "shopify",
      url: "https://memory-only.myshopify.com",
      apiKey: "memory-client-id",
      apiSecret: "memory-client-secret",
    },
  }));

  assert.equal([...storage.values.values()].some((value) => value.includes("memory-client")), false);

  const refreshed = createStore(storage).store;
  refreshed.activate(603);
  assert.equal(refreshed.readWorkspaceId(603), 63);
  assert.deepEqual(refreshed.getActiveSnapshot().siteDraft, createEmptyOnboardingSiteDraft());
});
