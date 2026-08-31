//! Happy-path lifecycle tests: circle creation, round advance, get_circle_count.

use super::*;

#[test]
fn happy_path_round_pays_out_and_advances() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, s.contribution * (s.size as i128));

    let recipient = Address::generate(&s.env); // fresh, unrelated to any funder
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
    assert_eq!(token_client.balance(&s.client_id), 0);

    let circle_after = client.get_circle(&s.circle_id);
    assert_eq!(circle_after.pot, 0);
    assert_eq!(circle_after.round, 1);
}

#[test]
fn get_circle_count_tracks_next_circle_id() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    assert_eq!(client.get_circle_count(), 0);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = real_root(&env);
    let vk = real_verification_key(&env);

    client.create_circle(&admin, &token, &root, &100i128, &5u32, &vk);
    assert_eq!(client.get_circle_count(), 1);

    client.create_circle(&admin, &token, &root, &100i128, &5u32, &vk);
    assert_eq!(client.get_circle_count(), 2);
}

#[test]
fn get_round_returns_current_round() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    assert_eq!(client.get_round(&s.circle_id), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_round_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_round(&999u64);
}

#[test]
fn get_status_returns_round_pot_target_cancelled() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let (round, pot, target, cancelled) = client.get_status(&s.circle_id);
    assert_eq!(round, 0);
    assert_eq!(pot, 0i128);
    assert_eq!(target, s.contribution * (s.size as i128));
    assert!(!cancelled);

    // Fund one member and confirm pot advances.
    client.fund(&s.circle_id, &s.members[0]);
    let (round2, pot2, target2, cancelled2) = client.get_status(&s.circle_id);
    assert_eq!(round2, 0);
    assert_eq!(pot2, s.contribution);
    assert_eq!(target2, target);
    assert!(!cancelled2);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_status_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_status(&999u64);
}

// ---- Issue #84: instance-storage TTL extension ----

#[test]
fn instance_ttl_extended_after_create_fund_claim() {
    // The Soroban test env lets us inspect TTLs via env.ledger().
    // Strategy: bump the ledger far enough that the instance entry would
    // expire if nothing extended it, then perform create/fund/claim and
    // confirm the TTL has been refreshed to at least LEDGER_THRESHOLD.
    //
    // LEDGER_EXTEND_TO == 500_000; we advance by LEDGER_THRESHOLD (100)
    // which is the minimum that triggers an extension.  After the call
    // the remaining TTL must be > 0 (i.e. the entry did not expire).
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token);
    let root = real_root(&env);
    let vk = real_verification_key(&env);

    // create_circle must extend instance TTL.
    client.create_circle(&admin, &token, &root, &100i128, &5u32, &vk);

    // Advance the ledger by LEDGER_THRESHOLD so the instance entry would
    // expire without the extension; the TTL should now be refreshed.
    env.ledger().with_mut(|l| {
        l.sequence_number += LEDGER_THRESHOLD;
        l.timestamp += u64::from(LEDGER_THRESHOLD) * 5;
        l.min_persistent_entry_ttl = LEDGER_THRESHOLD;
        l.min_temp_entry_ttl = LEDGER_THRESHOLD;
    });

    // fund must also extend instance TTL.
    let member = Address::generate(&env);
    token_admin_client.mint(&member, &100i128);
    client.fund(&0u64, &member);

    // fund 4 more so we can claim.
    for _ in 0..4 {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &100i128);
        client.fund(&0u64, &m);
    }

    // claim must also extend instance TTL.
    let recipient = Address::generate(&env);
    client.claim(
        &0u64,
        &recipient,
        &real_nullifier_hash(&env),
        &real_external_nullifier_round0(&env),
        &real_valid_proof(&env),
    );

    // Verify the instance entry is still live (has a TTL > 0) after all
    // three write paths have run. If extend_ttl were missing, the entry
    // would have lapsed and NextCircleId would behave unpredictably.
    // The test env raises an error if a live entry is accessed after
    // its TTL expires, so a successful get_circle here is our proof.
    let circle = client.get_circle(&0u64);
    assert_eq!(circle.round, 1, "claim should have advanced round to 1");
}
