import { explorerTx, short } from "../lib/explorer.js";
import type { Member } from "../types.js";
import styles from "./FundingList.module.css";

export function FundingList({
  members,
  busy,
  round,
  contributionXlm,
  onFund,
}: {
  members: Member[];
  busy: string | null;
  round: number;
  contributionXlm: number;
  onFund: (i: number) => void;
}) {
  return (
    <>
      <h2>Fund</h2>
      <div className={styles.members}>
        {members.map((m, i) => (
          <div key={i} className={`${styles.member} ${m.funded ? styles.funded : ""}`}>
            <span className={styles.memberAddr}>
              member {i + 1} · {short(m.keypair.publicKey())}
            </span>
            {m.funded ? (
              <a className={styles.link} href={explorerTx(m.fundHash!)} target="_blank" rel="noreferrer">
                ✓ funded ↗
              </a>
            ) : (
              <button
                className={`${styles.btn} ${styles.btnSmall}`}
                disabled={!!busy || round > 0}
                onClick={() => onFund(i)}
              >
                Fund {contributionXlm} XLM
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
