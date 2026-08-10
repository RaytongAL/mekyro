import { FileCheck2, ShieldAlert } from "lucide-react";

import styles from "./ai-native-command-workbench.module.css";
import { PolicyStatus } from "./policy-status";
import type { ReviewCardData } from "@/lib/ai-native-command/synthetic-command-data";

type ReviewCardProps = {
  card: ReviewCardData;
};

export function ReviewCard({ card }: ReviewCardProps) {
  return (
    <section className={styles.reviewCard} aria-labelledby={`${card.id}-title`}>
      <div className={styles.reviewHeader}>
        <ShieldAlert size={20} aria-hidden="true" />
        <div>
          <span>Owner review proposal</span>
          <h3 id={`${card.id}-title`}>{card.title}</h3>
        </div>
      </div>

      <PolicyStatus compact policy_gate_status={card.policy_gate_status} />

      <div className={styles.reviewFacts}>
        <div>
          <span>Reviewer</span>
          <strong>{card.requiredReviewer}</strong>
        </div>
        <div>
          <span>Candidate</span>
          <strong>{card.candidatePayload}</strong>
        </div>
      </div>

      <div className={styles.evidenceList}>
        {card.evidenceSummary.map((item) => (
          <span key={item}>
            <FileCheck2 size={14} aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>

      <p className={styles.approvalBoundary}>{card.approvalBoundary}</p>
    </section>
  );
}
