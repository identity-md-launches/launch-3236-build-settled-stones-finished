# Recorded official responses

`sepolia-rpc.json` records read-only `eth_chainId` and `eth_call` results retrieved on 2026-11-12 from `https://ethereum-sepolia-rpc.publicnode.com`, calling the pinned proxy `0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4`. Keys are JSON `[method, params]` pairs. All `roundPage` results are unmodified, including their start checkpoints. The state response reported frontier 1248.

The regression harness changes **only the test state's frontier** to replay historical transitions (1200 → 1212) without waiting for new settlements. Its API responses, transaction hashes and failures are deliberately synthetic test cases. They never enter production assets or the game as fallback data. The harness performs no network requests.
