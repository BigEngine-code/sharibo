import type { Member } from "../types.js";

// The visible stages of doClaim, in the order they actually occur.
export type ClaimStage = "artifacts" | "proving" | "funding" | "submitting";

export const CLAIM_STAGE_LABELS: Record<ClaimStage, string> = {
  artifacts: "Fetching proving artifacts (wasm + zkey)…",
  proving: "Proving…",
  funding: "Funding a fresh, unlinked recipient…",
  submitting: "Submitting the claim…",
};

const CLAIM_STAGES: ClaimStage[] = ["artifacts", "proving", "funding", "submitting"];

// So a claim never reads as a hung tab: each real substage of doClaim gets
// its own line here.
export function ClaimProgress({
  stage,
  elapsedSeconds,
}: {
  stage: ClaimStage;
  elapsedSeconds: number;
}) {
  const activeIndex = CLAIM_STAGES.indexOf(stage);
  return (
    <div className="claim-progress">
      <div className="stepper">
        {CLAIM_STAGES.map((s, i) => (
          <div
            key={s}
            className={`step ${i < activeIndex ? "done" : i === activeIndex ? "active" : ""}`}
          >
            <span className="step-dot">{i < activeIndex ? "✓" : i + 1}</span>
            {CLAIM_STAGE_LABELS[s]}
          </div>
        ))}
      </div>
      {stage === "proving" && (
        <p className="techline">
          <span className="spinner" aria-hidden="true" /> Groth16 · BLS12-381 · 1,452 constraints ·
          proving locally in your browser, nothing sent anywhere until the proof is done ·{" "}
          {elapsedSeconds}s elapsed
        </p>
      )}
    </div>
  );
}

export function ClaimSection({
  members,
  claimantIndex,
  onSelectClaimant,
  busy,
  claimStage,
  proveElapsedSeconds,
  onClaim,
}: {
  members: Member[];
  claimantIndex: number;
  onSelectClaimant: (i: number) => void;
  busy: string | null;
  claimStage: ClaimStage | null;
  proveElapsedSeconds: number;
  onClaim: () => void;
}) {
  return (
    <>
      <h2>Claim</h2>
      <p className="sub">
        Pick which member is claiming this round — the proof will show the contract that they're a
        real member <em>without</em> revealing which one.
      </p>
      <div className="row">
        {members.map((_, i) => (
          <label key={i} className="radio">
            <input
              type="radio"
              checked={claimantIndex === i}
              onChange={() => onSelectClaimant(i)}
              disabled={!!busy}
            />
            member {i + 1}
          </label>
        ))}
      </div>
      <button className="btn btn-primary" disabled={!!busy} onClick={onClaim}>
        {claimStage ? CLAIM_STAGE_LABELS[claimStage] : "Generate proof & claim"}
      </button>
      {claimStage && (
        <ClaimProgress stage={claimStage} elapsedSeconds={proveElapsedSeconds} />
      )}
    </>
  );
}
