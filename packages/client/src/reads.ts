import type { ShariboClient } from "./connect.js";

// @ts-ignore
declare const withRetry: any;

/**
 * A view of a Sharibo circle's state.
 *
 * @property admin - The admin address for the circle.
 * @property token - The token address for contributions.
 * @property root - The Merkle tree root of identity commitments.
 * @property contribution - The required contribution amount per participant.
 * @property size - The maximum number of participants.
 * @property round - The current round number.
 * @property pot - The total amount in the prize pot.
 */
export interface CircleView {
  admin: string;
  token: string;
  root: bigint;
  contribution: bigint;
  size: number;
  round: number;
  pot: bigint;
}

/** Pure read: the current count of circles ever created. 0 if none yet. */
export async function getCircleCount(client: ShariboClient): Promise<bigint> {
  const tx = await client.get_circle_count();
  const sent = await tx.signAndSend({ force: true });
  return sent.result as bigint;
}

/**
 * Retrieves the current state of a circle.
 *
 * @param client - The Sharibo contract client.
 * @param circleId - The ID of the circle to query.
 * @returns The circle's current state.
 */
export async function getCircle(client: ShariboClient, circleId: bigint): Promise<CircleView> {
  // get_circle is a pure read: the SDK detects no signature is needed and
  // refuses signAndSend() without `force` (there's nothing to sign/submit).
  const tx = await withRetry(() => client.get_circle({ circle_id: circleId }));
  const sent = await tx.signAndSend({ force: true });
  return sent.result;
}

/** Pure read: whether `nullifierHash` has already claimed in this circle. */
export async function hasClaimed(
  client: ShariboClient,
  circleId: bigint,
  nullifierHash: bigint,
): Promise<boolean> {
  const tx = await withRetry(() => client.has_claimed({
    circle_id: circleId,
    nullifier_hash: nullifierHash,
  }));
  const sent = await tx.signAndSend({ force: true });
  return sent.result;
}

