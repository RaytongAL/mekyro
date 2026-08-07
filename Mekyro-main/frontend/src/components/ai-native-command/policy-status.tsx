import styles from "./ai-native-command-workbench.module.css";
import type { PolicyGateStatus } from "@/lib/ai-native-command/synthetic-command-data";

const policyLabels: Record<PolicyGateStatus, string> = {
  allowed: "allowed",
  proposal_only: "proposal_only",
  human_attention: "human_attention",
  blocked: "blocked",
  hidden: "hidden",
};

type PolicyStatusProps = {
  policy_gate_status: PolicyGateStatus;
  compact?: boolean;
};

function classNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function PolicyStatus({
  policy_gate_status,
  compact,
}: PolicyStatusProps) {
  return (
    <span className={styles.statusGroup} aria-label="policy status">
      <span
        className={classNames(
          styles.policyStatus,
          styles[`policy_${policy_gate_status}`],
          compact && styles.compactStatus,
        )}
      >
        <span className={styles.statusText}>{policyLabels[policy_gate_status]}</span>
      </span>
    </span>
  );
}
