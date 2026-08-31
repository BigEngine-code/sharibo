//! Funding tests: over/under funding, RoundFull, overflow, anyone_can_fund,
//! get_pot, get_contributors.

use super::*;

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // RoundNotFunded
// Ideally we'd pin pot == contribution*size - 1 (the single stroop
    // short of full) as the tightest possible underfunded case. But `fund`
    // only ever moves whole `contribution`-sized deposits — there's no way
    // to land the pot on a non-multiple-of-contribution value through the
    // public API. The tightest *reachable* underfunded state is one missing
    // depositor, so that's what this test pins instead.
fn claim_reverts_when_underfunded() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    // only 4 of 5 members fund this round
    for m in s.members.iter().take(4) {
        client.fund(&s.circle_id, m);
    }

    let recipient = Address::generate(&s.env);
    let nullifier_hash = real_nullifier_hash(&s.env);
    let external_nullifier = real_external_nullifier_round0(&s.env);
    let proof = real_valid_proof(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")] // RoundFull
fn sixth_fund_on_full_round_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, s.contribution * (s.size as i128));

    // A sixth deposit must fail with RoundFull — otherwise pot > target and
    // claim's equality check bricks forever.
    let griefer = Address::generate(&s.env);
    token_admin_client.mint(&griefer, &s.contribution);
    client.fund(&s.circle_id, &griefer);
}

#[test]
fn claim_works_on_fully_funded_round_after_cap() {
    // Companion to sixth_fund_on_full_round_reverts: five funds reach the
    // cap exactly, claim still pays out (over-funding never mutated state).
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }
    assert_eq!(
        client.get_circle(&s.circle_id).pot,
        s.contribution * (s.size as i128)
    );

    let recipient = Address::generate(&s.env);
    let nullifier_hash = real_nullifier_hash(&s.env);
    let external_nullifier = real_external_nullifier_round0(&s.env);
    let proof = real_valid_proof(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
    assert_eq!(
        token_client.balance(&recipient),
        s.contribution * (s.size as i128)
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")] // Overflow
fn fund_reverts_on_pot_target_overflow() {
    // contribution * size overflows i128 → typed Overflow before any transfer.
    let s = setup(2, i128::MAX);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.fund(&s.circle_id, &s.members[0]);
}

#[test]
fn anyone_can_fund() {
    // Open-funding guarantee: a stranger (not in the member set created by
    // setup) can pay a contribution into the circle. Membership gates claim
    // via the Merkle root, not fund. See contracts/README.md.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);

    let stranger = Address::generate(&s.env);
    token_admin_client.mint(&stranger, &s.contribution);
    client.fund(&s.circle_id, &stranger);

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, s.contribution);
}

#[test]
fn get_pot_returns_current_pot() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    assert_eq!(client.get_pot(&s.circle_id), 0i128);

    client.fund(&s.circle_id, &s.members[0]);
    assert_eq!(client.get_pot(&s.circle_id), s.contribution);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_pot_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_pot(&999u64);
}

#[test]
fn get_contributors_returns_funders_in_order() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    // Before anyone funds, the list is empty.
    let contributors = client.get_contributors(&s.circle_id);
    assert_eq!(contributors.len(), 0);

    // After two members fund, they appear in insertion order.
    client.fund(&s.circle_id, &s.members[0]);
    client.fund(&s.circle_id, &s.members[1]);
    let contributors = client.get_contributors(&s.circle_id);
    assert_eq!(contributors.len(), 2);
    assert_eq!(contributors.get(0).unwrap(), s.members[0]);
    assert_eq!(contributors.get(1).unwrap(), s.members[1]);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_contributors_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_contributors(&999u64);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn fund_unknown_circle_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.fund(&999u64, &s.members[0]);
}
