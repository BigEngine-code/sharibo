import { explorerContract } from "../lib/explorer.js";
import { useI18n } from "../i18n.js";

const NAMES = [
  "ajo",
  "esusu",
  "tanda",
  "cundina",
  "susu",
  "tontine",
  "junta",
  "pandero",
  "consórcio",
  "hui",
  "paluwagan",
  "chit fund",
];

export function Landing({
  busy,
  error,
  previousCircleId,
  onLaunch,
}: {
  busy: string | null;
  error: string | null;
  previousCircleId: bigint | null;
  onLaunch: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="card hero">
        <div className="namewall">
          {NAMES.map((n) => (
            <span key={n} className="namewall-item">
              {n}
            </span>
          ))}
        </div>
        <h1>SHARIBO</h1>
        <p className="tagline">{t("landing.tagline")}</p>
        <p className="sub">
          {t("landing.sub.before")} <em>{t("landing.sub.em1")}</em> {t("landing.sub.middle")}{" "}
          <em>{t("landing.sub.em2")}</em> {t("landing.sub.after")}
        </p>
        <button className="btn btn-primary" disabled={!!busy} onClick={onLaunch}>
          {busy ?? t("landing.launch")}
        </button>
        {error && <p className="error">{error}</p>}
        {previousCircleId !== null && (
          <p className="fineprint">
            {t("landing.previousCirclePrefix")}{" "}
            <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
              {t("landing.previousCircleLink", { id: previousCircleId.toString() })}
            </a>
          </p>
        )}
        <p className="fineprint">{t("landing.testnetFineprint")}</p>
      </div>
    </div>
  );
}
