import type { FeeEstimate } from "@sharibo/client";
import type { Member } from "../types.js";
import { useI18n } from "../i18n.js";

const STROOPS_PER_XLM = 10_000_000n;

/** Format a stroop amount as a human-readable XLM string, e.g. "0.0123456 XLM". */
function formatXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  return `${whole}.${frac.toString().padStart(7, "0")} XLM`;
}

export function ClaimSection({
  members,
  claimantIndex,
  onSelectClaimant,
  busy,
  onClaim,
  feeEstimate,
}: {
  members: Member[];
  claimantIndex: number;
  onSelectClaimant: (i: number) => void;
  busy: string | null;
  onClaim: () => void;
  feeEstimate?: FeeEstimate | null;
}) {
  const { t } = useI18n();
  return (
    <>
      <h2>{t("claim.heading")}</h2>
      <p className="sub">{t("claim.subtitle")}</p>
      <div className="row">
        {members.map((_, i) => (
          <label key={i} className="radio">
            <input
              type="radio"
              checked={claimantIndex === i}
              onChange={() => onSelectClaimant(i)}
              disabled={!!busy}
            />
            {t("claim.radioMember", { index: i + 1 })}
          </label>
        ))}
      </div>
      {feeEstimate && (
        <p className="techline fee-estimate">
          Estimated claim fee:{" "}
          <strong>{formatXlm(feeEstimate.totalFee)}</strong>
          {" "}·{" "}
          resource fee {formatXlm(feeEstimate.minResourceFee)}
          {" "}· the BLS12-381 pairing check makes this higher than a typical Soroban call
        </p>
      )}
      <button className="btn btn-primary" disabled={!!busy} onClick={onClaim}>
        {busy ?? t("claim.generateButton")}
      </button>
      {busy && <p className="techline">{t("claim.techline")}</p>}
    </>
  );
}
