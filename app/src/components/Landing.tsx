import { explorerContract } from "../lib/explorer.js";

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
        <p className="tagline">
          A private rotating savings circle — on Stellar, with real zero-knowledge proofs.
        </p>
        <p className="sub">
          Every round, everyone contributes. Every round, one member takes the pot. Sharibo proves{" "}
          <em>who's entitled to claim</em> without ever revealing <em>who</em> claimed.
        </p>
        <button className="btn btn-primary" disabled={!!busy} onClick={onLaunch}>
          {busy ?? "Launch a 5-member circle on testnet"}
        </button>
        {error && <p className="error">{error}</p>}
        {previousCircleId !== null && (
          <p className="fineprint">
            Your previous circle lives on at{" "}
            <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
              circle #{previousCircleId.toString()} ↗
            </a>
          </p>
        )}
        <p className="fineprint">
          Testnet only. Demo identities are generated fresh in your browser, never reused.
        </p>
      </div>
    </div>
  );
}
