import type { Keypair } from "@stellar/stellar-sdk";
import type { Identity } from "@sharibo/client";

export interface Member {
  keypair: Keypair;
  identity: Identity;
  funded: boolean;
  fundHash?: string;
}

export interface ClaimResult {
  recipient: string;
  hash: string;
}
