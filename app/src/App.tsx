import { useState } from "react";
import type { Keypair } from "@stellar/stellar-sdk";
import type {
  Identity,
  ContractProof,
  MerkleTree,
} from "@sharibo/client";

const preloadCrypto = () => {
  import("@stellar/stellar-sdk");
  import("@sharibo/client");
};

const NETWORK = {
  contractId: import.meta.env.VITE_SHARIBO_CONTRACT_ID as string,
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL as string,
  networkPassphrase: import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE as string,
};
const TOKEN = import.meta.env.VITE_TEST_TOKEN_CONTRACT_ID as string;
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
    <div className="stepper">
      {labels.map((label, i) => (
        <div key={label} className={`step ${i < step ? "done" : i === step ? "active" : ""}`}>
          <span className="step-dot">{i < step ? "✓" : i + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

// Purely presentational: after a claim, none of the 5 nodes are highlighted
// as "the one that claimed" — that's the point. From outside the ring, all
// five remain equally plausible; only the demo operator (via the radio
// picker below) ever knows which one actually did.
function MemberRing({
  members,
  revealed,
}: {
  members: { funded: boolean }[];
  revealed: boolean;
}) {
  const radius = 100;
  return (
    <div className="ring-wrap">
      <div className="ring">
        <div className="ring-center">{revealed ? "✓" : "pot"}</div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              className={`ring-node ${m.funded ? "funded" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {i + 1}
            </div>
          );
        })}
        {revealed && (
          <div className="ring-node ring-recipient" style={{ transform: "translate(0px, -170px)" }}>
            ?
          </div>
        )}
      </div>
      {revealed && (
        <p className="ring-caption">
          Payout landed on the address above — cryptographically, it could be tied to <em>any</em>{" "}
          of the 5 members in the ring. An outside observer cannot tell which.
        </p>
      )}
    </div>
  );
}

export default function App() {
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
  const [rejection, setRejection] = useState<string | null>(null);
  // Survives a reset so the landing screen can point back at the circle you
  // just left — it keeps living on-chain even though the UI has moved on.
  const [previousCircleId, setPreviousCircleId] = useState<bigint | null>(null);

  const contribution = BigInt(contributionXlm) * STROOPS_PER_XLM;
  const fundedCount = members.filter((m) => m.funded).length;
  const fullyFunded = pot === contribution * BigInt(CIRCLE_SIZE);

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
    setRejection(null);
    setScreen("landing");
  }

  async function startCircle() {
    setError(null);
    setBusy("Loading crypto libraries...");
    try {
      const [{ Keypair }, client] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
      const { generateIdentity, MerkleTree, verificationKeyToContractFormat, connect, createCircle } = client;

      setBusy("Generating a fresh admin + 5 member identities and funding via friendbot…");
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
      const [{ Keypair }, { connect, fund, getCircle }] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
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
      const [{ Keypair }, { computeExternalNullifier, generateProof, connect, claim, getCircle }] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
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
      const [{ Keypair }, { connect, fund, computeExternalNullifier, claim, getCircle }] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
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
        const { connect, getCircle } = await import("@sharibo/client");
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
          <button className="btn btn-primary" disabled={!!busy} onClick={startCircle} onMouseEnter={preloadCrypto}>
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

  const step: 0 | 1 | 2 | 3 = claimResult ? 3 : fullyFunded ? 2 : 1;

  return (
    <div className="page">
      <div className="card">
        <div className="row space-between">
          <h1 className="small">SHARIBO</h1>
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
            <h2>Claim</h2>
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
                Groth16 · BLS12-381 · 1,452 constraints · proving locally in your browser, nothing
                sent anywhere until the proof is done
              </p>
            )}
          </>
        )}

        {claimResult && (
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
              Compare the 5 funding transactions above to this claim — same contract, no shared
              address, no visible link.
            </p>
            <button className="btn btn-danger" disabled={!!busy} onClick={claimAgain}>
              {busy ?? "Try to claim again with the same proof"}
            </button>
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
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
