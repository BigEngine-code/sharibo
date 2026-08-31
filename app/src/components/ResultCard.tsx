import { explorerAccount, explorerTx, short } from "../lib/explorer.js";
import { explorerContract } from "../lib/explorer.js";
import type { ClaimResult } from "../types.js";

export function ResultCard({
  claimResult,
  rejection,
  busy,
  nullifierClaimed,
  circleId,
  onClaimAgain,
  onReset,
}: {
  claimResult: ClaimResult;
  rejection: string | null;
  busy: string | null;
  nullifierClaimed: boolean;
  circleId: bigint | null;
  onClaimAgain: () => void;
  onReset: () => void;
}) {
  return (
    <div className="result">
      <h2>Payout landed</h2>
      <p>
        Fresh recipient <code>{short(claimResult.recipient)}</code>{" "}
        <a href={explorerAccount(claimResult.recipient)} target="_blank" rel="noreferrer">
          ↗
        </a>{" "}
        received the pot. It has never appeared anywhere else on this circle.
      </p>
      <a className="link" href={explorerTx(claimResult.hash)} target="_blank" rel="noreferrer">
        view claim transaction ↗
      </a>
      <p className="callout">
        Compare the 5 funding transactions above to this claim — same contract, no shared address,
        no visible link.
      </p>
      <button
        className="btn btn-danger"
        disabled={!!busy || (!!rejection && nullifierClaimed)}
        onClick={onClaimAgain}
        title={
          rejection && nullifierClaimed
            ? "Nullifier already claimed (has_claimed)"
            : undefined
        }
      >
        {busy ?? "Try to claim again with the same proof"}
      </button>
      {nullifierClaimed && !rejection && (
        <p className="callout">
          <code>has_claimed</code> is true for this nullifier — a replay will be rejected on-chain.
        </p>
      )}
      {rejection && (
        <>
          <div className="rejected">
            <strong>Rejected on-chain:</strong> {rejection}
          </div>
          <div className="new-circle-cta">
            <button className="btn btn-primary" disabled={!!busy} onClick={onReset}>
              ↺ Start a new circle
            </button>
            <p className="fineprint">
              Circle #{circleId?.toString()} stays on-chain forever —{" "}
              <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
                view on explorer ↗
              </a>
              . Starting a new circle generates fresh identities and a brand-new on-chain record.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
