import { explorerAccount, explorerTx, short } from "../lib/explorer.js";
import { useI18n } from "../i18n.js";
import type { ClaimResult } from "../types.js";

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
  const { t } = useI18n();
  return (
    <div className="result">
      <h2>{t("result.heading")}</h2>
      <p>
        {t("result.recipientIntro")} <code>{short(claimResult.recipient)}</code>{" "}
        <a href={explorerAccount(claimResult.recipient)} target="_blank" rel="noreferrer">
          ↗
        </a>{" "}
        {t("result.recipientOutro")}
      </p>
      <a className="link" href={explorerTx(claimResult.hash)} target="_blank" rel="noreferrer">
        {t("result.viewClaimTx")}
      </a>
      <p className="callout">{t("result.callout")}</p>
      <button className="btn btn-danger" disabled={!!busy} onClick={onClaimAgain}>
        {busy ?? t("result.claimAgainButton")}
      </button>
      {rejection && (
        <>
          <div className="rejected">
            <strong>{t("result.rejectedLabel")}</strong> {rejection}
          </div>
          <button className="btn btn-primary" disabled={!!busy} onClick={onReset}>
            {t("result.startNewCircle")}
          </button>
        </>
      )}
    </div>
  );
}
