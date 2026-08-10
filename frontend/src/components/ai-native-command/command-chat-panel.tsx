import { Bot, SendHorizonal } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import styles from "./ai-native-command-workbench.module.css";
import {
  commandChatMessages,
} from "@/lib/ai-native-command/synthetic-command-data";

type CommandChatPanelProps = {
  mode?: "entry" | "full" | "rail";
  onOpenFullChat?: () => void;
};

const commonQuestions = [
  "今天有哪些待办？",
  "新增了哪些客户？",
  "哪些订单需要确认？",
  "本月成交收入是多少？",
  "需要我审批什么？",
];

type RailMessage = {
  id: string;
  speaker: "assistant" | "user";
  text: string;
};

function AssistantAvatar() {
  return (
    <span className={styles.assistantAvatar} aria-hidden="true">
      <Bot size={17} strokeWidth={2.2} />
    </span>
  );
}

export function CommandChatPanel({
  mode = "entry",
  onOpenFullChat,
}: CommandChatPanelProps) {
  const [railMessages, setRailMessages] = useState<RailMessage[]>([]);
  const [railDraft, setRailDraft] = useState("");
  const assistantName = "AI助理";
  const questions = commonQuestions;

  function sendRailMessage(text: string) {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    const timestamp = Date.now();

    setRailMessages((messages) => [
      ...messages,
      {
        id: `user-${timestamp}`,
        speaker: "user",
        text: trimmed,
      },
      {
        id: `assistant-${timestamp}`,
        speaker: "assistant",
        text: "我可以先根据当前页面整理可见信息；涉及关键决策时，会提示负责人确认。",
      },
    ]);
    setRailDraft("");
  }

  function handleRailKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      sendRailMessage(railDraft);
    }
  }

  if (mode === "rail") {
    return (
      <section className={styles.chatRailPanel} aria-label="右侧对话辅助栏">
        <div className={styles.chatAssistantHead}>
          <AssistantAvatar />
          <strong>{assistantName}</strong>
        </div>

        <p className={styles.chatRailIntro}>
          可以帮您查看当前页面、整理待办和查找相关记录。
        </p>

        <div className={styles.railQuestionList} aria-label="常见问题">
          {questions.map((question) => (
            <button key={question} type="button" onClick={() => sendRailMessage(question)}>
              {question}
            </button>
          ))}
        </div>

        <div className={styles.chatRailThread} aria-label="右侧对话记录">
          {railMessages.map((message) => (
            <article
              key={message.id}
              className={
                message.speaker === "assistant"
                  ? styles.railAssistantMessage
                  : styles.railUserMessage
              }
            >
              <span>{message.speaker === "assistant" ? assistantName : "您"}</span>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <div className={styles.railComposer}>
          <textarea
            aria-label="向 AI 助理提问"
            placeholder="继续提问..."
            value={railDraft}
            onChange={(event) => setRailDraft(event.target.value)}
            onKeyDown={handleRailKeyDown}
          />
          <button type="button" onClick={() => sendRailMessage(railDraft)}>
            发送
          </button>
        </div>

        <button type="button" className={styles.railOpenButton} onClick={onOpenFullChat}>
          打开完整对话
        </button>
      </section>
    );
  }

  if (mode === "full") {
    return (
      <section className={styles.chatPagePanel} aria-label="完整对话页面">
        <div className={styles.chatThread}>
          {commandChatMessages
            .filter((message) => message.surface === "supplier_command_inbox")
            .map((message) => (
              <article
                key={message.id}
                className={
                  message.speaker === "system"
                    ? styles.assistantMessage
                    : styles.userMessage
                }
              >
                <div className={styles.messageMeta}>
                  <span>{message.label}</span>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
        </div>

        <div className={styles.chatComposer}>
          <span>继续提问...</span>
          <button type="button" className={styles.limeButton}>
            发送
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.chatEntryPanel} aria-label="首页 AI 助理入口">
      <div className={styles.chatAssistantHead}>
        <AssistantAvatar />
        <strong>{assistantName}</strong>
      </div>

      <div className={styles.questionChips} aria-label="常见问题">
        {questions.map((question) => (
          <button key={question} type="button">
            {question}
          </button>
        ))}
      </div>

      <div className={styles.chatInputRow}>
        <span>输入问题，按回车进入完整对话...</span>
        <button type="button" className={styles.limeButton} onClick={onOpenFullChat}>
          <SendHorizonal size={16} aria-hidden="true" />
          发送
        </button>
      </div>
    </section>
  );
}
