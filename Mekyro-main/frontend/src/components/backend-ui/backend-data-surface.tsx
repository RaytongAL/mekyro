import type { ReactNode } from "react";

import styles from "./backend-ui.module.css";

type BackendDataSurfaceProps = {
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function BackendDataSurface({ toolbar, children, footer }: BackendDataSurfaceProps) {
  return (
    <section className={styles.dataSurface}>
      {toolbar ? <div className={styles.dataToolbar}>{toolbar}</div> : null}
      <div className={styles.dataBody}>{children}</div>
      {footer ? <div className={styles.dataFooter}>{footer}</div> : null}
    </section>
  );
}
