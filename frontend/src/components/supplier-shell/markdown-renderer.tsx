import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./supplier-shell.module.css";

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className={styles.markdownBody}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
