#![no_std]
use soroban_sdk::{contract, contractimpl, vec, Env, String, Vec};

// PHASE 0 PLACEHOLDER: proves the build -> deploy -> invoke pipeline works on
// testnet. Replaced by the real Circle / create_circle / fund / claim logic
// in Phase 2 (see contracts/sharibo/src/lib.rs history after that phase).
#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn hello(env: Env, to: String) -> Vec<String> {
        vec![&env, String::from_str(&env, "Hello"), to]
    }
}

mod test;
