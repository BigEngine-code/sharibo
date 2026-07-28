#![cfg(test)]

use super::*;
use ark_bls12_381::{Fq, Fq2, Fr as ArkFr};
use ark_ff::{BigInteger, PrimeField};
use ark_serialize::CanonicalSerialize;
use core::str::FromStr;
use soroban_sdk::{
    crypto::bls12_381::{G1_SERIALIZED_SIZE, G2_SERIALIZED_SIZE},
    testutils::Address as _,
    BytesN, U256,
};
use std::vec::Vec as StdVec;

// ---- BLS12-381 test fixture helpers ----
// The vk/proof/public-signal decimal coordinates below were produced by the
// real Phase 1 pipeline (circuits/scripts/{compile,setup,prove}.sh) for a
// genuine member of a 3-member circle at circle_id=0, round=0 — see
// circuits/verification_key.json and circuits/build/{proof,public}.json.
// This mirrors the pattern in Stellar's own groth16_verifier reference
// example (stellar/soroban-examples), which also hand-copies snarkjs
// decimal coordinates into ark_bls12_381 test fixtures.

fn g1_from_coords(env: &Env, x: &str, y: &str) -> G1Affine {
    let ark_g1 = ark_bls12_381::G1Affine::new(Fq::from_str(x).unwrap(), Fq::from_str(y).unwrap());
    let mut buf = [0u8; G1_SERIALIZED_SIZE];
    ark_g1.serialize_uncompressed(&mut buf[..]).unwrap();
    G1Affine::from_array(env, &buf)
}

fn g2_from_coords(env: &Env, x1: &str, x2: &str, y1: &str, y2: &str) -> G2Affine {
    let x = Fq2::new(Fq::from_str(x1).unwrap(), Fq::from_str(x2).unwrap());
    let y = Fq2::new(Fq::from_str(y1).unwrap(), Fq::from_str(y2).unwrap());
    let ark_g2 = ark_bls12_381::G2Affine::new(x, y);
    let mut buf = [0u8; G2_SERIALIZED_SIZE];
    ark_g2.serialize_uncompressed(&mut buf[..]).unwrap();
    G2Affine::from_array(env, &buf)
}

fn fr_from_dec_str(env: &Env, s: &str) -> Fr {
    let ark_fr = ArkFr::from_str(s).unwrap();
    let be_bytes = ark_fr.into_bigint().to_bytes_be();
    let mut buf = [0u8; 32];
    buf[32 - be_bytes.len()..].copy_from_slice(&be_bytes);
    Fr::from_bytes(BytesN::from_array(env, &buf))
}

fn real_verification_key(env: &Env) -> VerificationKey {
    VerificationKey {
        alpha: g1_from_coords(
            env,
            "1151103813686702670269560426972537615253723909179986658696264230739792718498157532050816457434960302183816446643642",
            "2264278419421030329175907976054147167790018368373903507517289863181729348732997145562393982010652254896115276313615",
        ),
        beta: g2_from_coords(
            env,
            "234715770815633506086876921775332881288881052225543236297905676400069922158500877154699132474175457598380425222782",
            "3305393283011938985382092861733522723974543802747257178218608747718267902286556196852282734837644244360170541159935",
            "218541127215008476487596590292634126552582077478272530353193596224995381682430953762052403998127371323829472216931",
            "3472177617825914068429071422901138564916107942636399548688833555975205972364256420268690345427377488835425312495997",
        ),
        gamma: g2_from_coords(
            env,
            "352701069587466618187139116011060144890029952792775240219908644239793785735715026873347600343865175952761926303160",
            "3059144344244213709971259814753781636986470325476647558659373206291635324768958432433509563104347017837885763365758",
            "1985150602287291935568054521177171638300868978215655730859378665066344726373823718423869104263333984641494340347905",
            "927553665492332455747201965776037880757740193453592970025027978793976877002675564980949289727957565575433344219582",
        ),
        delta: g2_from_coords(
            env,
            "1505663480440247367152274210534686704190808084502194263833763278218856322654435528468927287357012676094418832423740",
            "2217923485159127127358054503577598077067766532546569462988068791681035084120318859382637751335894429351377069493125",
            "201312034288505666799421355352986088320094318705596465895187137127289771723259790407432255968766382867575840805717",
            "2346025562149068308649760588360970027304594675678744818331923474605513300552094262642782296771200201388233281265374",
        ),
        ic: Vec::from_array(
            env,
            [
                g1_from_coords(
                    env,
                    "2221368706166660739597546727074260123281775003540941966931835158612081330822382179488852200096434901680516793712392",
                    "2404014037212414881167456460714355715416704233282862833716099779331158640973633758980226197491483021600744297772191",
                ),
                g1_from_coords(
                    env,
                    "1198160149030616374398274215183513043584950980067873401134193238044496098609747659763085151397985797374645000957006",
                    "3614419462164841247653425346411975433607429668303430144210238084452200375330796493724357191539115142864347073904259",
                ),
                g1_from_coords(
                    env,
                    "852316935886900058982967980013011638039951973864299630550149495121850204895787786975443699750375111333318850419951",
                    "1230987228089004764819399384472966074704351230098676072845721586570076864863307052458464544670345593450273305129595",
                ),
                g1_from_coords(
                    env,
                    "1139639735249734389716550152334771925368743101551174618639126933146950882148738629034742548110661371468474272052506",
                    "602183753303311254514069927726945031108676267537368074300846024773039689216672925642441569139153167028473300165854",
                ),
            ],
        ),
    }
}

fn real_valid_proof(env: &Env) -> Proof {
    Proof {
        a: g1_from_coords(
            env,
            "2907069310268506927967653105234275070128268344932018799202307568638524243743685053819117893057927396712794237316271",
            "373130779600397549851649388857830331983209375623014019669740756591312681846818289558274106749604172549278685616298",
        ),
        b: g2_from_coords(
            env,
            "88687641291656924342265046438282117906532557593586688258818110902634093761012368761408789865139551195758735245472",
            "2931727804921883042059339460132555811421644726178059935370544903705955682853915205767903973665758044084730052160807",
            "2495955506873325069736028596530775888523406662790722846362297674001660972217424902520084516088106660827329404981087",
            "493319590447739050326655214026524052634978631462133268976994138913317832516574873176083417782594509620067368433873",
        ),
        c: g1_from_coords(
            env,
            "1428615700984090449265189612110816848213500721015641443537106955299716003865429364687909580866203102480536327191699",
            "3928728866305584943415909200313916008044539956249419707814958809263031740910968235443475490085625971983080252158446",
        ),
    }
}

// Real public signals for the proof above: (nullifier_hash, root, external_nullifier).
fn real_root(env: &Env) -> Fr {
    fr_from_dec_str(env, "26209293814355131390889932661322725195394840191932303091376020297848638697892")
}
fn real_nullifier_hash(env: &Env) -> Fr {
    fr_from_dec_str(env, "21226719646080371019275358926522886326845061441166218142415794470695116145494")
}
fn real_external_nullifier_round0(env: &Env) -> Fr {
    fr_from_dec_str(env, "9916401131788634118796694467337109503795060207059715207260235684299224251787")
}

fn create_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone()).address()
}

fn expected_external_nullifier(env: &Env, circle_id: u64, round: u32) -> Fr {
    Contract::compute_external_nullifier(env, circle_id, round)
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

    // this is the FIRST circle registered against a fresh contract, so it
    // is assigned circle_id=0 — matching the real proof fixtures above,
    // which were generated for circle_id=0.
    let root = real_root(&env);
    let vk = real_verification_key(&env);
    let circle_id = client.create_circle(&admin, &token, &root, &contribution, &size, &vk);
    assert_eq!(circle_id, 0);

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
#[should_panic(expected = "Error(Contract, #5)")] // InvalidProof
fn claim_reverts_on_tampered_public_input() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = Address::generate(&s.env);
    // the real proof's actual output is real_nullifier_hash(); claiming
    // with a different nullifier_hash means the pairing check is being
    // asked to verify a statement the proof doesn't attest to.
    let wrong_nullifier_hash = real_nullifier_hash(&s.env) + Fr::from_u256(U256::from_u32(&s.env, 1));
    let external_nullifier = real_external_nullifier_round0(&s.env);
    let proof = real_valid_proof(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &wrong_nullifier_hash,
        &external_nullifier,
        &proof,
    );
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
#[should_panic(expected = "Error(Contract, #4)")] // AlreadyClaimed
fn second_claim_with_same_nullifier_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let nullifier_hash = real_nullifier_hash(&s.env);
    let proof = real_valid_proof(&s.env);

    // round 0: claim succeeds and marks the nullifier used
    let recipient_a = Address::generate(&s.env);
    let external_nullifier_0 = real_external_nullifier_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient_a,
        &nullifier_hash,
        &external_nullifier_0,
        &proof,
    );

    // top up and fund round 1 fully, then try to reuse the exact same
    // nullifier_hash from round 0. It's rejected by the nullifier map
    // before the (real, but now mismatched-round) proof would even be
    // checked, so reusing `proof` here is fine.
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
    let nullifier_hash = real_nullifier_hash(&s.env);
    // wrong: this circle is still on round 0, but we tag the proof for round 1
    let external_nullifier = expected_external_nullifier(&s.env, s.circle_id, 1);
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

    let root = real_root(&env);
    let vk = real_verification_key(&env);
    client.create_circle(&admin, &token, &root, &100i128, &5u32, &vk);

    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn fund_unknown_circle_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.fund(&999u64, &s.members[0]);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn claim_unknown_circle_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let recipient = Address::generate(&s.env);
    client.claim(
        &999u64,
        &recipient,
        &real_nullifier_hash(&s.env),
        &real_external_nullifier_round0(&s.env),
        &real_valid_proof(&s.env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_circle_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let _ = client.get_circle(&999u64);
}

// CPU-instruction harness: measures create_circle / fund / claim, plus a
// synthetic larger-IC Groth16 verify (more public inputs → more g1_mul).
// Tree depth does NOT change claim cost (circuit-only); IC length does.
// Numbers are printed and recorded in contracts/README.md (soroban-sdk 23.5.3).
#[test]
fn cpu_instruction_benchmarks() {
    // ---- create_circle ----
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = real_root(&env);
    let vk = real_verification_key(&env);
    client.create_circle(&admin, &token, &root, &100i128, &5u32, &vk);
    let create_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench create_circle: {create_cpu} CPU instructions");

    // ---- fund (one member) ----
    let token_admin_client = token::StellarAssetClient::new(&env, &token);
    let member = Address::generate(&env);
    token_admin_client.mint(&member, &100i128);
    client.fund(&0u64, &member);
    let fund_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench fund:          {fund_cpu} CPU instructions");

    // Fund the remaining 4 so claim can run.
    for _ in 0..4 {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &100i128);
        client.fund(&0u64, &m);
    }

    // ---- claim (current: 3 public inputs, ic.len() == 4) ----
    let recipient = Address::generate(&env);
    let nullifier_hash = real_nullifier_hash(&env);
    let external_nullifier = real_external_nullifier_round0(&env);
    let proof = real_valid_proof(&env);
    client.claim(&0u64, &recipient, &nullifier_hash, &external_nullifier, &proof);
    let claim_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench claim:         {claim_cpu} CPU instructions");

    // Headroom assertion: upgrades that blow past ~60% of the 100M budget fail loudly.
    assert!(
        claim_cpu < 60_000_000,
        "claim() CPU {claim_cpu} exceeded 60M headroom (budget 100M)"
    );

    // ---- larger IC (simulate 5 public inputs → ic.len() == 6) ----
    // Runs the same Groth16 path with 2 extra g1_mul terms. Proof will not
    // verify (dummy inputs); we only care about instruction cost.
    env.cost_estimate().budget().reset_default();
    let mut big_vk = real_verification_key(&env);
    let pad = big_vk.ic.get(0).unwrap();
    big_vk.ic.push_back(pad.clone());
    big_vk.ic.push_back(pad);
    let zero = Fr::from_u256(U256::from_u32(&env, 0));
    let big_inputs = vec![
        &env,
        nullifier_hash,
        root,
        external_nullifier,
        zero.clone(),
        zero,
    ];
    let _ = Contract::verify_groth16(&env, &big_vk, &proof, &big_inputs);
    let large_ic_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!(
        "bench verify_groth16 (5 public inputs / ic=6): {large_ic_cpu} CPU instructions"
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
fn has_claimed_false_before_true_after() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let nullifier_hash = real_nullifier_hash(&s.env);

    assert!(!client.has_claimed(&s.circle_id, &nullifier_hash));

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = Address::generate(&s.env);
    let external_nullifier = real_external_nullifier_round0(&s.env);
    let proof = real_valid_proof(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );

    assert!(client.has_claimed(&s.circle_id, &nullifier_hash));
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
