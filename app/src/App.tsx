import { useState, useRef, useEffect } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import {
  generateIdentity,
  computeExternalNullifier,
  MerkleTree,
  generateProof,
  verificationKeyToContractFormat,
  connect,
  createCircle,
  fund,
  claim,
  getCircle,
  hasClaimed,
  type Identity,
  type ContractProof,
} from "@sharibo/client";
import { config, configError } from "./config";

const NETWORK = {
  contractId: config.contractId,
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.networkPassphrase,
};
const TOKEN = config.testTokenContractId;
const LEVELS = 4;
const CIRCLE_SIZE = 5;
const STROOPS_PER_XLM = 10_000_000n;

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

async function friendbotFund(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot funding failed: ${res.status}`);
  }
}

function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
function explorerAccount(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}
function explorerContract(): string {
  return `https://stellar.expert/explorer/testnet/contract/${NETWORK.contractId}`;
}
function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

interface Member {
  keypair: Keypair;
  identity: Identity;
  funded: boolean;
  fundHash?: string;
}

interface ClaimResult {
  recipient: string;
  hash: string;
}

function Stepper({ step }: { step: 0 | 1 | 2 | 3 }) {
  const labels = ["Create", "Fund", "Prove & Claim", "Unlinked ✓"];
  return (
    // nav + ol give screen readers "step N of 4" list semantics without
    // changing any visual output — CSS targets .stepper and .step as before.
    <nav aria-label="Circle progress">
      <ol className="stepper" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {labels.map((label, i) => {
          const state = i < step ? "done" : i === step ? "active" : "";
          return (
            <li
              key={label}
              className={`step ${state}`}
              // aria-current="step" marks the single active step; completed
              // and upcoming steps get no aria-current attribute at all.
              {...(i === step ? { "aria-current": "step" as const } : {})}
            >
              {/* The dot (✓ / number) is decorative — the li text already
                  conveys position, so hide the dot from the AT tree. */}
              <span className="step-dot" aria-hidden="true">
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NetworkBanner() {
  const isTestnet = NETWORK.networkPassphrase.toLowerCase().includes("test");
  if (!isTestnet) return null;
  return (
    <div className="network-banner">
      Stellar testnet — no real funds ·{" "}
      <a
        href="https://github.com/glorious21-coder/sharibo#honest-limitations"
        target="_blank"
        rel="noreferrer"
      >
        limitations ↗
      </a>
    </div>
  );
}

// Purely presentational: after a claim, none of the 5 nodes are highlighted
// as "the one that claimed" — that's the point. From outside the ring, all
// five remain equally plausible; only the demo operator (via the radio
// picker below) ever knows which one actually did.
function useRingRadius(): number {
  const [radius, setRadius] = useState(100);

  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--ring-radius");
      setRadius(parseFloat(value) || 100);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return radius;
}

function MemberRing({
  members,
  revealed,
}: {
  members: { funded: boolean }[];
  revealed: boolean;
}) {
  const radius = useRingRadius();
  const fundedCount = members.filter((m) => m.funded).length;

  // Build a concise, dynamic summary for assistive technology.
  const ringLabel = revealed
    ? `${members.length}-member circle — pot claimed. Payout recipient is unlinkable to any member.`
    : `${members.length}-member circle, ${fundedCount} of ${members.length} funded, pot not yet claimed.`;

  // id used to associate the post-claim caption with the figure via
  // aria-describedby so VoiceOver reads it as supplementary description.
  const captionId = "ring-caption";

  return (
    <div className="ring-wrap">
      {/*
        role="img" turns the whole ring into a single AT object described by
        aria-label; aria-describedby wires up the visible caption when present.
        All child nodes are aria-hidden — the label already covers their state.
      */}
      <div
        className="ring"
        role="img"
        aria-label={ringLabel}
        {...(revealed ? { "aria-describedby": captionId } : {})}
      >
        <div className="ring-center" aria-hidden="true">
          {revealed ? "✓" : "pot"}
        </div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`ring-node ${m.funded ? "funded" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {i + 1}
            </div>
          );
        })}
        {revealed && (
          <div
            aria-hidden="true"
            className="ring-node ring-recipient"
            style={{ transform: "translate(0px, -170px)" }}
          >
            ?
          </div>
        )}
      </div>
      {revealed && (
        // id matches aria-describedby above; role="note" hints to AT that
        // this is supplementary information attached to the figure.
        <p id={captionId} role="note" className="ring-caption">
          Payout landed on the address above — cryptographically, it could be tied to <em>any</em>{" "}
          of the 5 members in the ring. An outside observer cannot tell which.
        </p>
      )}
    </div>
  );
}

function EnvSetupScreen({ errors }: { errors: string[] }) {
  return (
    <div className="page">
      <div className="card hero">
        <h1>SHARIBO</h1>
        <h2 style={{ color: "var(--color-error, #e55)" }}>Setup required</h2>
        <p className="sub">
          The app cannot start because one or more environment variables are missing or invalid.
          Copy <code>app/.env.example</code> to <code>app/.env</code> and fill in the values below,
          then restart the dev server.
        </p>
        <ul style={{ textAlign: "left", margin: "1rem 0", padding: "0 1.25rem" }}>
          {errors.map((err) => (
            <li key={err} style={{ marginBottom: "0.5rem" }}>
              <code>{err}</code>
            </li>
          ))}
        </ul>
        <p className="fineprint">
          See <code>app/.env.example</code> for the full list of required variables and their
          expected format.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (configError.length > 0) {
    return <EnvSetupScreen errors={configError} />;
  }

  const [screen, setScreen] = useState<"landing" | "circle">("landing");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [contributionXlm, setContributionXlm] = useState(10);
  const [admin, setAdmin] = useState<Keypair | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tree, setTree] = useState<MerkleTree | null>(null);
  const [circleId, setCircleId] = useState<bigint | null>(null);
  const [round, setRound] = useState(0);
  const [pot, setPot] = useState(0n);
  const [claimantIndex, setClaimantIndex] = useState(0);
  const [proof, setProof] = useState<ContractProof | null>(null);
  const [nullifierHash, setNullifierHash] = useState<bigint | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [nullifierClaimed, setNullifierClaimed] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  // Survives a reset so the landing screen can point back at the circle you
  // just left — it keeps living on-chain even though the UI has moved on.
  const [previousCircleId, setPreviousCircleId] = useState<bigint | null>(null);

  // Track the most recently completed circle so we can show a "lives on-chain" link
  // after a reset. Stored as { id, explorerUrl } so the fineprint is self-contained.
  const [prevCircle, setPrevCircle] = useState<{ id: string; explorerUrl: string } | null>(null);

  const contribution = BigInt(contributionXlm) * STROOPS_PER_XLM;
  const fundedCount = members.filter((m) => m.funded).length;
  const fullyFunded = pot === contribution * BigInt(CIRCLE_SIZE);

  // ── Focus management ────────────────────────────────────────────────────
  // When a screen or major section appears, move keyboard focus to its
  // heading (tabIndex={-1} makes non-interactive elements programmatically
  // focusable without inserting them into the Tab order).

  // 1. landing → circle: focus the circle card's "SHARIBO" h1
  const circleHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (screen === "circle") {
      circleHeadingRef.current?.focus();
    }
  }, [screen]);

  // 2. Fully funded → Claim section appears: focus "Claim" h2
  const claimHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (fullyFunded && !claimResult) {
      claimHeadingRef.current?.focus();
    }
    // Only trigger when fullyFunded flips to true; ignore claimResult changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullyFunded]);

  // 3. Claim succeeds → Payout section appears: focus "Payout landed" h2
  const payoutHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (claimResult) {
      payoutHeadingRef.current?.focus();
    }
  }, [claimResult]);
  // ────────────────────────────────────────────────────────────────────────

  // Reset every piece of React state back to its initial value and return to
  // the landing screen. The circle itself is never touched on-chain — it lives
  // on forever; we just stop pointing the UI at it (and remember its id so the
  // landing screen can link back to it). Confirm first only when a circle is
  // mid-flow — funded but not yet claimed — so an accidental click can't throw
  // away an in-progress round; a completed or untouched circle resets silently.
  function resetToLanding() {
    const midFlow = fundedCount > 0 && !claimResult;
    if (midFlow) {
      const ok = window.confirm(
        "This circle is funded but hasn't claimed yet. Start over anyway?\n\n" +
          "Your current circle stays on-chain — you just won't see it here.",
      );
      if (!ok) return;
    }

    setPreviousCircleId(circleId);

    setBusy(null);
    setError(null);
    setContributionXlm(10);
    setAdmin(null);
    setMembers([]);
    setTree(null);
    setCircleId(null);
    setRound(0);
    setPot(0n);
    setClaimantIndex(0);
    setProof(null);
    setNullifierHash(null);
    setClaimResult(null);
    setNullifierClaimed(false);
    setRejection(null);
    setScreen("landing");
  }

  async function startCircle() {
    setError(null);
    setBusy("Generating a fresh admin + 5 member identities and funding via friendbot…");
    try {
      const adminKp = Keypair.random();
      await friendbotFund(adminKp.publicKey());

      const newMembers: Member[] = Array.from({ length: CIRCLE_SIZE }, () => ({
        keypair: Keypair.random(),
        identity: generateIdentity(),
        funded: false,
      }));

      const newTree = MerkleTree.create(
        LEVELS,
        newMembers.map((m) => m.identity.commitment),
      );

      setBusy("Creating the circle on testnet…");
      const vkJson = await fetch("/circuits/verification_key.json").then((r) => r.json());
      const vk = verificationKeyToContractFormat(vkJson);
      const adminClient = await connect(NETWORK, adminKp);
      const { result: newCircleId } = await createCircle(adminClient, {
        admin: adminKp.publicKey(),
        token: TOKEN,
        root: newTree.root,
        contribution,
        size: CIRCLE_SIZE,
        vk,
      });

      setAdmin(adminKp);
      setMembers(newMembers);
      setTree(newTree);
      setCircleId(newCircleId);
      setRound(0);
      setPot(0n);
      setScreen("circle");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function fundMember(i: number) {
    if (!admin || circleId === null) return;
    setError(null);
    setBusy(`Funding from member ${i + 1}…`);
    try {
      const m = members[i];
      await friendbotFund(m.keypair.publicKey());
      const memberClient = await connect(NETWORK, m.keypair);
      const { hash } = await fund(memberClient, {
        circleId,
        from: m.keypair.publicKey(),
      });
      setMembers((prev) =>
        prev.map((mm, idx) => (idx === i ? { ...mm, funded: true, fundHash: hash } : mm)),
      );
      const adminClient = await connect(NETWORK, admin);
      const circle = await getCircle(adminClient, circleId);
      setPot(circle.pot);
      setRound(circle.round);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function doClaim() {
    if (!admin || !tree || circleId === null) return;
    setError(null);
    setClaimResult(null);
    setRejection(null);
    setBusy("Proving… (a real Groth16 proof is being generated in your browser)");
    try {
      const claimant = members[claimantIndex];
      const merkleProof = tree.proof(claimantIndex);
      const externalNullifier = await computeExternalNullifier(circleId, BigInt(round));
      const generated = await generateProof(
        {
          identityNullifier: claimant.identity.identityNullifier,
          identitySecret: claimant.identity.identitySecret,
          pathElements: merkleProof.pathElements,
          pathIndices: merkleProof.pathIndices,
          root: tree.root,
          externalNullifier,
        },
        "/circuits/membership.wasm",
        "/circuits/membership_final.zkey",
      );

      setBusy("Submitting the claim and generating a fresh, unlinked recipient…");
      const recipient = Keypair.random();
      await friendbotFund(recipient.publicKey());

      const adminClient = await connect(NETWORK, admin);
      const { hash } = await claim(adminClient, {
        circleId,
        recipient: recipient.publicKey(),
        nullifierHash: generated.nullifierHash,
        externalNullifier: generated.externalNullifier,
        proof: generated.proof,
      });

      setProof(generated.proof);
      setNullifierHash(generated.nullifierHash);
      setClaimResult({ recipient: recipient.publicKey(), hash });
      setNullifierClaimed(await hasClaimed(adminClient, circleId, generated.nullifierHash));

      const circle = await getCircle(adminClient, circleId);
      setPot(circle.pot);
      setRound(circle.round);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function claimAgain() {
    if (!admin || circleId === null || !proof || nullifierHash === null) return;
    setError(null);
    setRejection(null);
    setBusy("Refunding a new round, then replaying the same proof's nullifier…");
    try {
      // Fund round `round` again so this exercises the nullifier-reuse
      // check specifically, not just "the pot is empty" — the same
      // proof's nullifier gets rejected even against a fresh, funded round.
      const adminClient = await connect(NETWORK, admin);
      for (const m of members) {
        const memberClient = await connect(NETWORK, m.keypair);
        await fund(memberClient, { circleId, from: m.keypair.publicKey() });
      }
      const freshExternalNullifier = await computeExternalNullifier(circleId, BigInt(round));

      setBusy("Replaying the used nullifier…");
      await claim(adminClient, {
        circleId,
        recipient: Keypair.random().publicKey(),
        nullifierHash,
        externalNullifier: freshExternalNullifier,
        proof,
      });
      setRejection("Unexpected: the replayed claim was accepted (this should never happen).");
    } catch (e) {
      setRejection((e as Error).message);
    } finally {
      // Reflect the on-chain state either way: the re-funding above happened
      // for real even though the replayed claim itself was rejected.
      try {
        const adminClient = await connect(NETWORK, admin);
        const circle = await getCircle(adminClient, circleId);
        setPot(circle.pot);
        setRound(circle.round);
      } catch {
        // best-effort refresh only
      }
      setBusy(null);
    }
  }

  if (screen === "landing") {
    return (
      <div className="page">
        <NetworkBanner />
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
            Every round, everyone contributes. Every round, one member takes the pot. Sharibo
            proves <em>who's entitled to claim</em> without ever revealing <em>who</em> claimed.
          </p>
          <button className="btn btn-primary" disabled={!!busy} onClick={startCircle}>
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
          {prevCircle && (
            <p className="fineprint">
              Your previous circle #{prevCircle.id} lives on-chain —{" "}
              <a className="link" href={prevCircle.explorerUrl} target="_blank" rel="noreferrer">
                view on explorer ↗
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  const step: 0 | 1 | 2 | 3 = claimResult ? 3 : fullyFunded ? 2 : 1;

  return (
    <div className="page">
      <NetworkBanner />
      <div className="card">
        {/*
          Persistent live region — always in the DOM so the browser registers
          it before any text lands inside it (a common AT pitfall).
          aria-live="polite" lets the current reading finish first; "assertive"
          would interrupt mid-sentence which would be rude for long proof steps.
          aria-atomic="true" replaces the whole message on each update rather
          than diffing individual text nodes, which is more reliable across ATs.
        */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          // Visually hidden but readable by screen readers.
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: 0,
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {busy ?? (error ? `Error: ${error}` : "")}
        </div>
        <div className="row space-between">
          <h1 className="small" ref={circleHeadingRef} tabIndex={-1}>SHARIBO</h1>
          <div className="row">
            <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
              circle #{circleId?.toString()} on-chain ↗
            </a>
            <button
              className="btn btn-small"
              disabled={!!busy}
              onClick={resetToLanding}
              title={`Start over. Your current circle (#${circleId?.toString()}) keeps living on-chain.`}
            >
              Start a new circle
            </button>
          </div>
        </div>

        <Stepper step={step} />

        <MemberRing members={members} revealed={!!claimResult} />

        <div className="pot-bar-wrap">
          <div className="pot-bar" style={{ width: `${(fundedCount / CIRCLE_SIZE) * 100}%` }} />
        </div>
        <p className="pot-label">
          pot: {(Number(pot) / 1e7).toFixed(1)} / {contributionXlm * CIRCLE_SIZE} XLM · round{" "}
          {round}
        </p>

        <h2>Fund</h2>
        <div className="members">
          {members.map((m, i) => (
            <div key={i} className={`member ${m.funded ? "funded" : ""}`}>
              <span className="member-addr">member {i + 1} · {short(m.keypair.publicKey())}</span>
              {m.funded ? (
                <a className="link" href={explorerTx(m.fundHash!)} target="_blank" rel="noreferrer">
                  ✓ funded ↗
                </a>
              ) : (
                <button
                  className="btn btn-small"
                  disabled={!!busy || round > 0}
                  onClick={() => fundMember(i)}
                >
                  Fund {contributionXlm} XLM
                </button>
              )}
            </div>
          ))}
        </div>

        {fullyFunded && !claimResult && (
          <>
            <h2 ref={claimHeadingRef} tabIndex={-1}>Claim</h2>
            <p className="sub">
              Pick which member is claiming this round — the proof will show the contract that
              they're a real member <em>without</em> revealing which one.
            </p>
            <div className="row">
              {members.map((_, i) => (
                <label key={i} className="radio">
                  <input
                    type="radio"
                    checked={claimantIndex === i}
                    onChange={() => setClaimantIndex(i)}
                    disabled={!!busy}
                  />
                  member {i + 1}
                </label>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!!busy} onClick={doClaim}>
              {busy ?? "Generate proof & claim"}
            </button>
            {busy && (
              <p className="techline">
                {/* Constraint count: update this AND circuits/README.md if the circuit changes. */}
                Groth16 · BLS12-381 · 1,452 constraints · proving locally in your browser, nothing
                sent anywhere until the proof is done
              </p>
            )}
          </>
        )}

        {claimResult && (
          <div className="result">
            <h2 ref={payoutHeadingRef} tabIndex={-1}>Payout landed</h2>
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
              Compare the 5 funding transactions above to this claim — same contract, no shared
              address, no visible link.
            </p>
            <button
              className="btn btn-danger"
              disabled={!!busy || (!!rejection && nullifierClaimed)}
              onClick={claimAgain}
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
                <code>has_claimed</code> is true for this nullifier — a replay will be rejected
                on-chain.
              </p>
            )}
            {rejection && (
              <>
                <div className="rejected">
                  <strong>Rejected on-chain:</strong> {rejection}
                </div>
                <button className="btn btn-primary" disabled={!!busy} onClick={resetToLanding}>
                  Start a new circle
                </button>
              </>
            )}
            {rejection && (
              <div className="new-circle-cta">
                <button
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={resetToLanding}
                >
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
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
