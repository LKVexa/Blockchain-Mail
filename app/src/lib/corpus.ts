/** One plaintext per vertex. The first eight open at genesis; the rest stay sealed until recovered. */
export const CORPUS: readonly string[] = [
  "The virtual blockchain is not another layer-1. It is the hypervisor that lets Web 4 run above physical settlement.",
  "Physical chains bind execution, consensus, and data into one clock. Agents cannot think at that speed, so the lattice only checkpoints what has been opened.",
  "Obscura keeps the backplane quiet. Work happens inside a seal. The seal opens only when its four vertex words are recovered.",
  "Trust is a service, not a destination. A computation may run anywhere if the JA21 key can pin the plaintext back to this vertex.",
  "Layer one is settlement. This log stores opened seals, the solver who recovered them, and a hash chained to the previous checkpoint.",
  "Layer two is verifiable execution. The machine is not the 256-bit EVM. It is the JA21 four-word key schedule from cypher 4.3.3.",
  "Each fresh seal draws sixteen entropy bytes. Each byte is one syllable: the high nibble picks an onset, the low nibble a rime.",
  "Four syllables make one word. Four words make the key for this vertex. Every minted word is exactly eight letters.",
  "The AES key is not the words. It is SHA-256 of the domain string with V1, V2, V3, and V4 written in order.",
  "Domain JA21/CYPHER/VERTEX-WORD-KEY/v1. Spelling and order are mandatory. Swap two words and the tag will not verify.",
  "The payload is AES-256-GCM under that key — the confidentiality the JA21 engine names — implemented here so the schedule stays reviewable.",
  "Known syllables can be published as clues. Hidden syllables are the work. One hidden syllable is two hundred fifty-six candidates.",
  "An agent never receives the account key. It receives a session: a spend cap, a selector whitelist, and a recipient glued to the account.",
  "The account is the policy hypervisor. Executors may propose. Hooks may revert. A foreign recipient never becomes a seal.",
  "An intent says what should be true. It does not dictate the calldata. Solvers recover the words; the tag decides if they told the truth.",
  "The first recovery whose key opens the ciphertext is the checkpoint. Losing guesses leave the vertex sealed.",
  "Cross-chain routes stay behind the seal. The vertex does not teach a bridge. It only accepts an outcome the policy already allowed.",
  "When the cap or the selector is wrong, the gateway refuses to mint. Nothing is obfuscated, and nothing is spent.",
  "Identity here is a vertex you can open, plus the checkpoints you have already produced. A name without a recovery is not a principal.",
  "Discovery may point at a vertex. It cannot skip the words. Reachability is not authority.",
  "Reputation is the opened plaintext and the solver who paid for the search, not a score the agent posts about itself.",
  "Value moves only after the authentication tag verifies. A fluent sentence is not a signature.",
  "Read the stack from the top if you want: semantic interface, policy hypervisor, declarative intent, JA21 execution, settlement log.",
  "Thirty-two vertices are the whole state machine. Resealing a vertex starts a new generation. The old checkpoint stays in the log.",
  "Prompt injection is just another intent. If it names a foreign recipient, the hook reverts before a seal is minted.",
  "Morse, Base64, or verse do not widen a session. The boundary is the account, not the language model that phrased the request.",
  "A different failure: the seal can open and still be useless if what it asks cannot be settled. Opening is not liquidity.",
  "A vertex key left in a log is already a solved vertex. The markdown recovery sheet and the package do not belong in the same place.",
  "Institutions may fund the lattice. They do not receive a quieter path through the policy hook.",
  "The key schedule is published because an opaque engine may recover a package. It may not define this chain.",
  "Geopolitics follows the architecture. A virtual chain that hides its derivation is just another platform.",
  "Delegation with a boundary: four words, eight letters, thirty-two vertices, and a hook that can still say no.",
];

export const QUORUM = [
  "Recognition",
  "Browser",
  "Proxy",
  "Torus",
  "Relay",
  "Cryptography",
  "DNS & Egress",
  "Capability",
  "Interface",
  "Lifecycle",
  "Test & Fuzz",
  "Evidence",
  "Chair",
] as const;

export const SELF_ACCOUNT = "obscura.self";

export const SELECTORS = ["settle.intent", "checkpoint.treatise", "route.solver", "mail.accept"] as const;

export type Selector = (typeof SELECTORS)[number];
