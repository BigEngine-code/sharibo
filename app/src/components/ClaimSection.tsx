import type { Member } from "../types.js";
import { useI18n } from "../i18n.js";

export function ClaimSection({
  members,
  claimantIndex,
  onSelectClaimant,
  busy,
  onClaim,
}: {
  members: Member[];
  claimantIndex: number;
  onSelectClaimant: (i: number) => void;
  busy: string | null;
  onClaim: () => void;
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
      <button className="btn btn-primary" disabled={!!busy} onClick={onClaim}>
        {busy ?? t("claim.generateButton")}
      </button>
      {busy && <p className="techline">{t("claim.techline")}</p>}
    </>
  );
}
