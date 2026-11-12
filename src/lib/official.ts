// Pinned official deployment. Source: https://docs.squeekchain.com/developers/#deployments
// Pin as of 2026-11-12: core-sepolia-20261103 r7, chain 11155111, proxy below.
export const CHAIN_ID = 11155111n;
export const CHAIN_ID_HEX = '0xaa36a7';
export const DEPLOYMENT = 'core-sepolia-20261103 r7';
export const PROXY = '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4';
export const ABI_URL = 'https://docs.squeekchain.com/assets/abi/SqueekCore.json';
export const API_BASE = 'https://api.squeekchain.com';
/** Official public Sepolia RPCs, tried in order. A user-set Sepolia RPC is tried last. */
export const RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://1rpc.io/sepolia',
  'https://sepolia.gateway.tenderly.co',
  'https://0xrpc.io/sep',
];
export const ROUND_DURATION = 600n;
export const MAX_WORK_PER_ROUND = 10000n;
export const PAGE_MAX = 16n;
export const WINDOW = 144n;
export const TABLE_SIZE = 8;
export const BOARD = 9;
