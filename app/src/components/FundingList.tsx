import { explorerTx, short } from "../lib/explorer.js";
import { useI18n } from "../i18n.js";
import type { Member } from "../types.js";

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
  const { t } = useI18n();
  return (
    <>
      <h2>{t("fund.heading")}</h2>
      <div className="members">
        {members.map((m, i) => (
          <div key={i} className={`member ${m.funded ? "funded" : ""}`}>
            <span className="member-addr">
              {t("fund.memberLabel", { index: i + 1 })} · {short(m.keypair.publicKey())}
            </span>
            {m.funded ? (
              <a className="link" href={explorerTx(m.fundHash!)} target="_blank" rel="noreferrer">
                {t("fund.fundedLink")}
              </a>
            ) : (
              <button
                className="btn btn-small"
                disabled={!!busy || round > 0}
                onClick={() => onFund(i)}
              >
                {t("fund.demoButton", { amount: contributionXlm })}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
