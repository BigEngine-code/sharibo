#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use std::vec::Vec as StdVec;

fn create_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone()).address()
}

fn expected_external_nullifier(env: &Env, circle_id: u64, round: u32) -> BytesN<32> {
    let mut bytes = Bytes::new(env);
    bytes.extend_from_array(&circle_id.to_be_bytes());
    bytes.extend_from_array(&round.to_be_bytes());
    env.crypto().sha256(&bytes).to_bytes()
}

struct Setup {
    env: Env,
    client_id: Address,
    token: Address,
    members: StdVec<Address>,
    circle_id: u64,
    size: u32,
    contribution: i128,
}

fn setup(size: u32, contribution: i128) -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token);

    let root = BytesN::from_array(&env, &[7u8; 32]);
    let vk = Bytes::from_array(&env, &[0u8; 4]);
    let circle_id = client.create_circle(&admin, &token, &root, &contribution, &size, &vk);

    let mut members: StdVec<Address> = StdVec::new();
    for _ in 0..size {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &contribution);
        members.push(m);
    }

    Setup {
        env,
        client_id: contract_id,
        token,
        members,
        circle_id,
        size,
        contribution,
    }
}

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
    let nullifier_hash = BytesN::from_array(&s.env, &[42u8; 32]);
    let external_nullifier = expected_external_nullifier(&s.env, s.circle_id, 0);
    let proof = Bytes::from_array(&s.env, &[0u8; 4]);

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
#[should_panic(expected = "Error(Contract, #2)")] // RoundNotFunded
fn claim_reverts_when_underfunded() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    // only 4 of 5 members fund this round
    for m in s.members.iter().take(4) {
        client.fund(&s.circle_id, m);
    }

    let recipient = Address::generate(&s.env);
    let nullifier_hash = BytesN::from_array(&s.env, &[1u8; 32]);
    let external_nullifier = expected_external_nullifier(&s.env, s.circle_id, 0);
    let proof = Bytes::from_array(&s.env, &[0u8; 4]);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // AlreadyClaimed
fn second_claim_with_same_nullifier_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let nullifier_hash = BytesN::from_array(&s.env, &[9u8; 32]);
    let proof = Bytes::from_array(&s.env, &[0u8; 4]);

    // round 0: claim succeeds and marks the nullifier used
    let recipient_a = Address::generate(&s.env);
    let external_nullifier_0 = expected_external_nullifier(&s.env, s.circle_id, 0);
    client.claim(
        &s.circle_id,
        &recipient_a,
        &nullifier_hash,
        &external_nullifier_0,
        &proof,
    );

    // top up and fund round 1 fully, then try to reuse the exact same
    // nullifier_hash from round 0
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);
    for m in s.members.iter() {
        token_admin_client.mint(m, &s.contribution);
        client.fund(&s.circle_id, m);
    }
    let recipient_b = Address::generate(&s.env);
    let external_nullifier_1 = expected_external_nullifier(&s.env, s.circle_id, 1);
    client.claim(
        &s.circle_id,
        &recipient_b,
        &nullifier_hash,
        &external_nullifier_1,
        &proof,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // WrongRoundTag
fn claim_reverts_on_stale_round_tag() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = Address::generate(&s.env);
    let nullifier_hash = BytesN::from_array(&s.env, &[3u8; 32]);
    // wrong: this circle is still on round 0, but we tag the proof for round 1
    let external_nullifier = expected_external_nullifier(&s.env, s.circle_id, 1);
    let proof = Bytes::from_array(&s.env, &[0u8; 4]);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
fn fund_requires_member_auth() {
    // env.auths() reports the authorization tree seen during the *last*
    // invocation, so calling it straight after fund() isolates that call
    // regardless of what setup() already authorized.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let member = &s.members[0];
    client.fund(&s.circle_id, member);

    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(&auths[0].0, member);
}

#[test]
fn create_circle_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);

    let root = BytesN::from_array(&env, &[7u8; 32]);
    let vk = Bytes::from_array(&env, &[0u8; 4]);
    client.create_circle(&admin, &token, &root, &100i128, &5u32, &vk);

    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}
