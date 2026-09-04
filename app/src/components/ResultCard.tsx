import { explorerAccount, explorerTx, short } from "../lib/explorer.js";
import type { ClaimResult } from "../types.js";
import styles from "./ResultCard.module.css";

export function ResultCard({
  claimResult,
  rejection,
  busy,
  onClaimAgain,
  onReset,
}: {
  claimResult: ClaimResult;
  rejection: string | null;
  busy: string | null;
  onClaimAgain: () => void;
  onReset: () => void;
}) {
  return (
    <div className={styles.result}>
      <h2>Payout landed</h2>
      <p>
        Fresh recipient <code>{short(claimResult.recipient)}</code>{" "}
        <a href={explorerAccount(claimResult.recipient)} target="_blank" rel="noreferrer">
          ↗
        </a>{" "}
        received the pot. It has never appeared anywhere else on this circle.
      </p>
      <a className={styles.link} href={explorerTx(claimResult.hash)} target="_blank" rel="noreferrer">
        view claim transaction ↗
      </a>
      <p className={styles.callout}>
        Compare the 5 funding transactions above to this claim — same contract, no shared address,
        no visible link.
      </p>
      <button className={`${styles.btn} ${styles.btnDanger}`} disabled={!!busy} onClick={onClaimAgain}>
        {busy ?? "Try to claim again with the same proof"}
      </button>
      {rejection && (
        <>
          <div className={styles.rejected}>
            <strong>Rejected on-chain:</strong> {rejection}
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!!busy} onClick={onReset}>
            Start a new circle
          </button>
        </>
      )}
    </div>
  );
}
