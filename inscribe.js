// inscribe.js — Build per-piece HTML inscription files for Cessation.
// The engine (index_bundle.js) is a separate text/javascript inscription.
// Every piece is a thin HTML file that loads the engine via <script src>.
//
// Usage (same for all pieces):
//   node inscribe.js <pieceIndex> <blockHash> <blockTimestamp> <engineId> <blockHeight>
//
// pieceIndex    : 0–N (open-ended — new pieces with new health data can be added)
// blockHash     : 64-char hex string of the reference block
// blockTimestamp: Unix seconds of that block
// engineId      : inscription ID of the engine (text/javascript) inscription
// blockHeight   : block height at inscription time
//
// Every piece uses --parent engineId. Sats are derived, not typed — see below.
// The collection grows: a new piece is minted whenever new ECG/lab data arrives.
// Never hardcode a piece count here — index the collection, don't count it.
//
// The printed `ord wallet inscribe` command carries --sat, and ord fails outright
// if that sat is not in the wallet. That is the real backstop against inscribing
// on the wrong sat: move the sat from ord-cold to ord first, and if ord cannot
// find it, stop and work out why rather than dropping the flag.
//

// ── Sat assignment ────────────────────────────────────────────────────────────
// Rewritten 2026-09-06, twice. First to drop the stale v1/v2 table (every entry
// non-null and every entry wrong, so the old "is it filled in?" check would have
// waved a re-mint onto sats already carrying three inscriptions). Then again once
// regtest showed how rare sats are actually consumed. See memory/testing.md.
//
// THE ENGINE goes on an Omega black uncommon, inscribed by hand, not by this script:
//   ord wallet inscribe --fee-rate <R> --sat 1459982499999999 \
//       --postage <that carrier's rare run> --file index_bundle.js
//
// EVERY PIECE goes on a CARRIER — a UTXO whose first sat is the piece's sat.
// Carriers are not a formula. A contiguous rare range cannot be handed out one sat
// per piece: an inscription consumes a contiguous RUN of `postage` sats starting at
// its target, so adjacent sats cannot each sit at offset 0 of a separate output.
// The range must first be SPLIT into carriers (see memory/testing.md, "Option 1"),
// and the carriers are then real UTXOs with real first sats and real run lengths —
// including a short final carrier topped up with common padding. So this table is
// filled in FROM THE SPLIT TRANSACTION, not computed.
//
// Fill one entry per carrier, in the order pieces should claim them:
//   { sat: <first sat of the carrier>, run: <how many RARE sats it holds> }
// `run` is what --postage must be set to. Setting it lower lets the reveal fee eat
// the remainder of the run; ord's default of 10,000 would swallow the whole thing.
// Read `run` off the split tx with /output/<outpoint> on the ord server.
//
// FILLED 2026-09-12 from the mainnet peel — see memory/inscribe.md §8b.
// 153 carriers were made from the 907-sat Nakamoto range; the 150 CONSECUTIVE
// ones are the piece assignments, the other 3 are spares (they sit after a gap).
// Every entry verified on chain: 330 sats, one Nakamoto sat at offset 0,
// persistently locked in ord-cold.
//
// `postage` is the carrier's FULL OUTPUT SIZE, not its rare-sat count.
// The rule is that the carrier passes through unchanged — output[0] the same size
// as input[0] — with the fee coming from a separate input. A carrier here is
// 1 rare sat + 329 common padding = 330 sats, so --postage 330.
// (An earlier field named `run` held the rare run length. That was the same number
// while carriers were all-rare chunks, and became wrong the moment they were
// padded: it would have printed `--postage 1sat`, below dust.)
const PIECE_CARRIERS = [
  // 150 consecutive Nakamoto-era sats, oldest first.
  // piece 0 takes 12425429610010 — the oldest Nakamoto sat held.
  // Peeled from the 907-sat range on mainnet 2026-09-07..12; every carrier is
  // 330 sats with its rare sat at offset 0 and is persistently locked in ord-cold.
  { sat: 12425429610010, postage: 330 },   // piece 0   00ca3bab0828b36c315dd4f8b98a024b216c4559ae665a416faa62b6620aa206:1
  { sat: 12425429610011, postage: 330 },   // piece 1   4070a87b10202aa7fd2df379ada5a2ed3ae850b9f81cd59c597b74508898dcb9:1
  { sat: 12425429610012, postage: 330 },   // piece 2   3360db2faaab9c7bf18cb012d6d4476596d94bb38352624934ec5b96f3162a03:1
  { sat: 12425429610013, postage: 330 },   // piece 3   f1889d043888e90fcf48b0e5bff30a958204848fa45c95a7e7d02ffa7ea1cd98:1
  { sat: 12425429610014, postage: 330 },   // piece 4   8b148a1e600272f106b370ba83b5d6c25407df4423a3e03bd52aeacc0d6ba228:1
  { sat: 12425429610015, postage: 330 },   // piece 5   2cf6bf870e207ab6171a50c4560b30c9882cc8d52bdecbc12cc12810447802eb:1
  { sat: 12425429610016, postage: 330 },   // piece 6   c68ddccc7d6ccd0146063e3c50dd3dfc062831b0787fca63797e2046c0ccb281:1
  { sat: 12425429610017, postage: 330 },   // piece 7   ab633404545cac147e2aa5af238fe604fd4205b978f376f580d86ba212360eb2:1
  { sat: 12425429610018, postage: 330 },   // piece 8   252672b0afa595350b7aa7e486652ed56bd33a409330ad0171b08591d94e1cc3:1
  { sat: 12425429610019, postage: 330 },   // piece 9   7cbc2a941ad85929dd66097b99000281cd6a9c593f8045f6491d2a81537a3a9f:1
  { sat: 12425429610020, postage: 330 },   // piece 10  43508a7fbb0e78ba3127a1e405c3ec088afb7568efb66e73cee1ae51cb40777a:1
  { sat: 12425429610021, postage: 330 },   // piece 11  146ec019f9c64320a750e2674daa55ee0116d8579f7900d78bc614b4f291bfaf:1
  { sat: 12425429610022, postage: 330 },   // piece 12  5361c021346317879331b0faf3a5d0916f0483303d9515d362e9b22d1bb6ed8d:1
  { sat: 12425429610023, postage: 330 },   // piece 13  b25245596c5d18dfc233156db587f553dafe6268435ac24f4adfe976337bf63c:1
  { sat: 12425429610024, postage: 330 },   // piece 14  79dbb95d8787437ab1cd1cf6546a94abef522b09294da34a93e522f8b4b53d30:1
  { sat: 12425429610025, postage: 330 },   // piece 15  a75f626a969a15e92bc14bfe931fa717812c05c8aff5407a37d23f0e0f6cff30:1
  { sat: 12425429610026, postage: 330 },   // piece 16  9dcb3b433cbd135a41cbea378569c8c9c8d905b61e686c1b6f9d40c1a1c2b8fa:1
  { sat: 12425429610027, postage: 330 },   // piece 17  d9cdce3331bf52c1647b30baff630c4e7506b81db81c1915e8dc260c85005cbe:1
  { sat: 12425429610028, postage: 330 },   // piece 18  bf6c2d3b6c93a2e8624a73e1b30728d4f7b9ffd58b46e6f0fac2f3f0c2282a25:1
  { sat: 12425429610029, postage: 330 },   // piece 19  cc4d366db744214105049f871394ca8940efe7ba1423f0bed8c2366942762376:1
  { sat: 12425429610030, postage: 330 },   // piece 20  1790eae07d860bac681385f47018fcc478ab1769911411f80b91671bc48fa4ae:1
  { sat: 12425429610031, postage: 330 },   // piece 21  f8d0708407a6ca55a58c495c236826cbe57c3e754748e5a8029ec67c333eab8a:1
  { sat: 12425429610032, postage: 330 },   // piece 22  2acaa7806c07489279b39150992fac0df86288e3c485e92de5dbdf04f0b09d17:1
  { sat: 12425429610033, postage: 330 },   // piece 23  a6abb05cf165a017d1c604bc8ad1e742d9185ee6d0388471ad7ac3bc8741d6cd:1
  { sat: 12425429610034, postage: 330 },   // piece 24  ad3a1c680509527cc3cf99cdc10aa50d18ab765da9e1658aea6c3975b3259733:1
  { sat: 12425429610035, postage: 330 },   // piece 25  e4f6c4ef3bf10bdb9d17059bcc89272ffef6001c3dc432cc8a1f66cc93647d9c:1
  { sat: 12425429610036, postage: 330 },   // piece 26  1ff910de29183eaaeba3780ac6d27b91a6a1efe3cca3831a62dfdac2a8677dee:1
  { sat: 12425429610037, postage: 330 },   // piece 27  9abc3805f28ade08064733a105f9836d2df5410867bfe9fdb4d24968339b1230:1
  { sat: 12425429610038, postage: 330 },   // piece 28  866c2fc80fcfe85e2424ea9b5b688f81333af2734e13eb12f8518b4ff18c1f3a:1
  { sat: 12425429610039, postage: 330 },   // piece 29  05307624397e8838d321f773d2e89353c3b750d14a09cda053353c75de97f6e9:1
  { sat: 12425429610040, postage: 330 },   // piece 30  2ef8794715134e4b85d952f3a6dc517339720a19e8d6d2aa8d20fe57f1151331:1
  { sat: 12425429610041, postage: 330 },   // piece 31  c77887e65ad1bcfb3d8f08a16c7b4fe712b6b5f2de1d7c118e0944ea7d3b4b72:1
  { sat: 12425429610042, postage: 330 },   // piece 32  5d9b0e3c96b1fa18ba57f9a0c43b5f2491d61dbc3708398a8821af4d3cb13a25:1
  { sat: 12425429610043, postage: 330 },   // piece 33  102a73ba1d8139a38117eff9e1761683ba850927ce6d3d77a17eaeff7d9b459c:1
  { sat: 12425429610044, postage: 330 },   // piece 34  b18c1c19ad21d90ce3f9fb4c649a256f720da0607d66ce16df3b85a81f6f26da:1
  { sat: 12425429610045, postage: 330 },   // piece 35  51aee7d327d9aa5f595f1f36f83389ca62fd3d3f006d1c25b44b932b79570d23:1
  { sat: 12425429610046, postage: 330 },   // piece 36  47cafd331d5f3938f921cf9a26de2018c6d447179070fae0e0d9cfc8ecb08513:1
  { sat: 12425429610047, postage: 330 },   // piece 37  b7906105b8d72a3dd7b09de78eb9f49e9762c3502205b44605a2c95aa885015b:1
  { sat: 12425429610048, postage: 330 },   // piece 38  068c671a8a81f096fa8708c7f2d30c35efd55beff59f216a32ff060b13931ac0:1
  { sat: 12425429610049, postage: 330 },   // piece 39  71f4e15429e3dd9fa4b1e9418fe276ef1a447f8815887bcf1463d99c2c1cd56a:1
  { sat: 12425429610050, postage: 330 },   // piece 40  8ba62e17b81eeb14426c339dd0817c84032fc498d5a832cd83b134ad713f8ce4:1
  { sat: 12425429610051, postage: 330 },   // piece 41  fdaf5c1365b1e93d1ce07fbabc173e66703fe2ca9571117866820334753562dd:1
  { sat: 12425429610052, postage: 330 },   // piece 42  2625da31e9f98f6102d5451e054bca5210b64a77da7239766bf9cae23fea0380:1
  { sat: 12425429610053, postage: 330 },   // piece 43  fa764086ffab9955197d153dd62399a8f01faa51877c5453ed5a69ee3ad8bcca:1
  { sat: 12425429610054, postage: 330 },   // piece 44  50c872066acf3adcacd2eb340bb2b8119bcc8c5916ad475b310565b26f8c1497:1
  { sat: 12425429610055, postage: 330 },   // piece 45  b0c24207365ef3ee64bf13a19f5f12584682cb2edf29ee38a803bffdc57fa7de:1
  { sat: 12425429610056, postage: 330 },   // piece 46  df182a2a3e41684be419b50b63f20e4f57fa272a94c27277d76fc96ad6732a8f:1
  { sat: 12425429610057, postage: 330 },   // piece 47  466a2be36aeb307ac3b40efb46906c59a771182916b472b0f0157b1e8867df18:1
  { sat: 12425429610058, postage: 330 },   // piece 48  a30f563f5519545747cf57b7d4e8bd0c1f5ed6ff780b6e1b72b9f22f8b696b9d:1
  { sat: 12425429610059, postage: 330 },   // piece 49  7cd8c71dc1cb344ec001c7c32d058eb2e3308e7f4e6ecd7eae5e2363035e02fa:1
  { sat: 12425429610060, postage: 330 },   // piece 50  727f184a8767a5fdb4420661dbbe323962d5f09b95c292c80a487483f33b21fe:1
  { sat: 12425429610061, postage: 330 },   // piece 51  23fda04124c660285aaaaf8eb5077df9736ce1d14d3679c27f23fa9e2d66ca0f:1
  { sat: 12425429610062, postage: 330 },   // piece 52  16a16b20657a584e08fe878db6cf78020f2b0a6b99d457f50b1ff56e6d1ac320:1
  { sat: 12425429610063, postage: 330 },   // piece 53  3dafb063e442e27fa2e49114de8229cd28e19b49ec924cdc1365207902d4a253:1
  { sat: 12425429610064, postage: 330 },   // piece 54  dd12692ebb3d089e60b1184c9bc11001c50128611458bb2ccf3c3dfaee7680d4:1
  { sat: 12425429610065, postage: 330 },   // piece 55  e0a027f58cbc63539dc9ac00513be6d733bbaeacb4f93b9ceedafa3664d9e147:1
  { sat: 12425429610066, postage: 330 },   // piece 56  80add0337cb3f2f3d52b0158eefb9d82e043947aead582fdb31cf94b509c76ff:1
  { sat: 12425429610067, postage: 330 },   // piece 57  429d3c8710380a28f2e0c936a364649dad3581c0bf4c8322bdc35253f7812719:1
  { sat: 12425429610068, postage: 330 },   // piece 58  7bb023ae9135a515c9a5a05a828ef20456269488bf17f9bb51773ccac05627f2:1
  { sat: 12425429610069, postage: 330 },   // piece 59  3470c6662231008c46f5906fedc4751a9587f5efe7289029772fbe7a026d6a25:1
  { sat: 12425429610070, postage: 330 },   // piece 60  b4a7c7d855f7a01c3378a82cab0d1e8c5be898e091981d4b29056c81c5fa2496:1
  { sat: 12425429610071, postage: 330 },   // piece 61  cc05b8521cb2c8abde2c07cc9a8edc63bd8edc9a97fcb5add5dd9cb7458eac99:1
  { sat: 12425429610072, postage: 330 },   // piece 62  2b1b319686ec897d8ecfc0567c40756642ffee35e58ef64759d8b083a7de3522:1
  { sat: 12425429610073, postage: 330 },   // piece 63  798bd26c0d3aa27b126d1f9612b4159e0c7da04f3cdee44229547d461e285777:1
  { sat: 12425429610074, postage: 330 },   // piece 64  b84e0f7eb154463f74c48a32ddfec64ca1b07cda8cc4248549a7af3b8590051d:1
  { sat: 12425429610075, postage: 330 },   // piece 65  885cee85d9713e6af16b884919df24067dc3531176fe73cd80523010a2c20249:1
  { sat: 12425429610076, postage: 330 },   // piece 66  b5230558fa0dc49a6fa52f1a8cb664522f090c1aea6f6be955f9705ce5810723:1
  { sat: 12425429610077, postage: 330 },   // piece 67  d8048e614490df23ef1be017176e3305f99637afd3c91df38bebd5581e20a206:1
  { sat: 12425429610078, postage: 330 },   // piece 68  01c3442995d29c3d53b311b48532cd8966dfdcb065ab6fe3a03715359b9f6d5c:1
  { sat: 12425429610079, postage: 330 },   // piece 69  1c328929815c999170180a36d66fbb5dd4fe81ec2d055f9467989e0d086df58b:1
  { sat: 12425429610080, postage: 330 },   // piece 70  4890260e65d28fc2fe443a10cc4eaa35e6d07b8341e8dd33ffb5dbe4ec98a770:1
  { sat: 12425429610081, postage: 330 },   // piece 71  53685e7adef207c9f62aac8ca487eda517eb01021798eb7a7f4678ad5539cd6a:1
  { sat: 12425429610082, postage: 330 },   // piece 72  21f7a612bdd66f77d46e07f1406b9342dbf0dd8c55d63f0a8197bb6e590df528:1
  { sat: 12425429610083, postage: 330 },   // piece 73  42b67f8684f6854233ce8ee3b22e27485dc49d81f7606052a81b4f1ad7d20010:1
  { sat: 12425429610084, postage: 330 },   // piece 74  b8c8e0ca06e16a6cfa78537cf866f9d53a2d0f3642d95b51ecf6a551eb7a5faf:1
  { sat: 12425429610085, postage: 330 },   // piece 75  b2375ae8b6c0b8fd490b55957550dce84b2b14d96aa7be87732baefa66cdbbe8:1
  { sat: 12425429610086, postage: 330 },   // piece 76  ba4c4c45c51b222aa07f333ffa3fe566a534cc99e17dacf1d7e5b77731a6c5f0:1
  { sat: 12425429610087, postage: 330 },   // piece 77  9f3c4fc766f31332a4019221c0d93c36f41564d5e530a5ba50595b3a80df8117:1
  { sat: 12425429610088, postage: 330 },   // piece 78  7793cee94e600024363000fdd78452c19077b7e729df0d2876f72db0d7531d9f:1
  { sat: 12425429610089, postage: 330 },   // piece 79  706ed4acf7e4fc75a8283b1624cde3714d5d7825feb90503525e0078591893e6:1
  { sat: 12425429610090, postage: 330 },   // piece 80  16ec3c634ac278bb6f6c2fb7f77a736366ef87f621575f8098e6ef62264dc44a:1
  { sat: 12425429610091, postage: 330 },   // piece 81  d330a1d8a2e8daf2d07b65d657ba92fec2cea3e780b9f29aa108262dd24a67a4:1
  { sat: 12425429610092, postage: 330 },   // piece 82  6cdbae0acdf3fc2cfbf64a4f20eac2781898856b83c32911acf696076012f04e:1
  { sat: 12425429610093, postage: 330 },   // piece 83  7ae410d40714283e11149b5cea9d03e52c9bd87b10b79f8de0657eeb94012559:1
  { sat: 12425429610094, postage: 330 },   // piece 84  7a109607d20ffd02a4cd3cb100a63d7dc9865a41a6a79bcc1a64d3811b734569:1
  { sat: 12425429610095, postage: 330 },   // piece 85  5906b8382159975316e9984a1f1c9d78c2ad3c63091c7a4e04893b4417071280:1
  { sat: 12425429610096, postage: 330 },   // piece 86  7adcb551901daf23c97e119117e5998f59e7b67534db93757e8afb809ee4cd56:1
  { sat: 12425429610097, postage: 330 },   // piece 87  3195b19b9e316dacec2ea977879745416b1b7606d96cd2f42b61013c811fb2d0:1
  { sat: 12425429610098, postage: 330 },   // piece 88  419a7b8997c3e543283df04cef7552ab03b7a680c9152a88d0dd26eadc2248f7:1
  { sat: 12425429610099, postage: 330 },   // piece 89  20039603e03305489bcabf7531d88788e0cb28cbdce91c1d9f5f964645dad080:1
  { sat: 12425429610100, postage: 330 },   // piece 90  2510cafd43984a8dd94c79ffa7a3f485611a3ef3f5bad7be2b68a6064b2e0ef9:1
  { sat: 12425429610101, postage: 330 },   // piece 91  b99b39f0a171ca8d8a34248fad4890dd8145d1072919dda4de2359c38cdc0ef8:1
  { sat: 12425429610102, postage: 330 },   // piece 92  705ce39885b41690d95967d57c2343b6d525c57dd33758d7006f3d9e97ce765b:1
  { sat: 12425429610103, postage: 330 },   // piece 93  cbecc92ed644998772fbb643ec95e0da5ed3fea9efd831a6cfdac227f8a66d6f:1
  { sat: 12425429610104, postage: 330 },   // piece 94  8726287c93eed14b5d791b21bc8751b5f8704a171256e8b3228a55b8e09373a5:1
  { sat: 12425429610105, postage: 330 },   // piece 95  898d6999b239a4721c22c3e8495aaf41324ebaa8a22350f0b9e27f565272128e:1
  { sat: 12425429610106, postage: 330 },   // piece 96  cce1d509b9d12628d42e214946d23ec8f0e49f558b17c80cbeb04ed0762a7653:1
  { sat: 12425429610107, postage: 330 },   // piece 97  3c418684c360d2f2034dca1c3cb54e5727ce43f168c9831be6b1b58b7077459f:1
  { sat: 12425429610108, postage: 330 },   // piece 98  3e760224d5f7cb6899ad7fde91e74455771c3f224f9e5de4d4927dfc84dae508:1
  { sat: 12425429610109, postage: 330 },   // piece 99  0e35c026f95a5021b8788249773c4ec3842474504e5874a080ca24e21a64d4f6:1
  { sat: 12425429610110, postage: 330 },   // piece 100 22325f5d431cd4a41c0802552211e9e075d7656196a3f53eb5bddf2faaaae0b4:1
  { sat: 12425429610111, postage: 330 },   // piece 101 8af568e15a8e854712c4f1496aad55c3aa0b3615fd0148f2f4217b624826f80f:1
  { sat: 12425429610112, postage: 330 },   // piece 102 897fc60edf0a496e8e0e95baec7ca52e6c6503420f42938104bc17e43fab776b:1
  { sat: 12425429610113, postage: 330 },   // piece 103 ef40709d5f696a0be32c9dfddf6e29f71a7214e9689e813ebe658872b7d57dbc:1
  { sat: 12425429610114, postage: 330 },   // piece 104 c9a44e14951990e6caea91a74baa6003fb7f6f366614b6bfc16de5d46bf87b74:1
  { sat: 12425429610115, postage: 330 },   // piece 105 2e5598328c53e5f6bbb2263f6677a3bac0b65cff4b44b533fe41fafa9ace67c5:1
  { sat: 12425429610116, postage: 330 },   // piece 106 fa773e76182c7e6b369097c79e54fba081dd7510eff9c68e5dec339110f89e93:1
  { sat: 12425429610117, postage: 330 },   // piece 107 abd53f85b5d9ffc042a5c388592b87e3c5ac997689b62de304c0f57af794b970:1
  { sat: 12425429610118, postage: 330 },   // piece 108 e7082f009b75d1381a1a9029768346465c9f2e52759a45c837e19c22ef09ae6d:1
  { sat: 12425429610119, postage: 330 },   // piece 109 642aa29f4c39292ddca8bd49f7cf746bb2d6dcca0bebfb5520cdc00994b8d82c:1
  { sat: 12425429610120, postage: 330 },   // piece 110 c5d9d5e4412e698e51c2392a0f9c192632c819c9dff85782801ab216fe992237:1
  { sat: 12425429610121, postage: 330 },   // piece 111 a91af257e1c5b81a2311b4dcc0d81dfe6a713c736cfd36096285a6dc49640668:1
  { sat: 12425429610122, postage: 330 },   // piece 112 d0f5848aa3653ed90b7a2ea15637930684b89e4eeacd007d1e49ef6b5a1dbbd2:1
  { sat: 12425429610123, postage: 330 },   // piece 113 7d0cc96003aff12b1aeda3731838fcbed3ed7269d94c0cc71d372bcce6de711a:1
  { sat: 12425429610124, postage: 330 },   // piece 114 093207522ed0a0a967d6abfc0a452ef32701f49c3baec476b61c7ac5862c83e8:1
  { sat: 12425429610125, postage: 330 },   // piece 115 19b14ab229d9a3346750ab4375b4aa6e43a52a05fc5be0edaab8898af9b48f77:1
  { sat: 12425429610126, postage: 330 },   // piece 116 018342057a63a52e2200f5d866020410909299a53e05f8f1daa20557becbf384:1
  { sat: 12425429610127, postage: 330 },   // piece 117 20a2ad38177ae4ff0e775aef268ad8726ea27df5231d56c8fdc2f2c95960de76:1
  { sat: 12425429610128, postage: 330 },   // piece 118 23639fd738d1a591398e89142d8e3c50a5c0605b3991bec7a41fa1998a107a69:1
  { sat: 12425429610129, postage: 330 },   // piece 119 ad03faf8d472cff4680b4585f45d8b9e9b57177e3db6ca5d9ec862ddac5fa68a:1
  { sat: 12425429610130, postage: 330 },   // piece 120 416b1d1252a083fe98e585b1dbe4712e25ea0af410c90bc959aee891e0dfbdc2:1
  { sat: 12425429610131, postage: 330 },   // piece 121 f7acdf4f031063f2db70c760b33da979c30f8f7c6d67aed621d00e8e15623ce3:1
  { sat: 12425429610132, postage: 330 },   // piece 122 29d08ccc31a0a9961e6bff245495c7a2c983510f3f671583ea235f0fedfc2ebc:1
  { sat: 12425429610133, postage: 330 },   // piece 123 9d40d21a863a4ecfad0f35c641bb61dc9af3071a0fd789011f42e7832578f0b6:1
  { sat: 12425429610134, postage: 330 },   // piece 124 644d9fe841295a9a65053e5968c05122fe82be112f6a56e6a0084221183dbdea:1
  { sat: 12425429610135, postage: 330 },   // piece 125 cf531d25c39e9ba2d3197c3f3a56c5f7d83a894f7307aee47bd7db022efaaac7:1
  { sat: 12425429610136, postage: 330 },   // piece 126 417196a22f77c4272c743badd9720596b5536445424e937164942bcbd69ed0cf:1
  { sat: 12425429610137, postage: 330 },   // piece 127 fdc2c25c903af0c78705132bbdf1c61f41b1f9429c843b5c2c7d42f3070da2f9:1
  { sat: 12425429610138, postage: 330 },   // piece 128 787a9024210ee63b1888211c170e380a3a399c1cb020e836a300628b7c738f39:1
  { sat: 12425429610139, postage: 330 },   // piece 129 69dc28f3e81ce7cada66c76c137627f86226e284c12996aad9155c243c2b8f21:1
  { sat: 12425429610140, postage: 330 },   // piece 130 d11595bb5c4529d395143fdfb1ed1cb60dd40dc977c710adf7fb43c32675c87d:1
  { sat: 12425429610141, postage: 330 },   // piece 131 3f623938cc4cd984142fcdebf55a543fd822f99cc388db76cd9846d4e69591be:1
  { sat: 12425429610142, postage: 330 },   // piece 132 c5a1c9a0e181f775a70e0255ef482965dddd39b2da44a33719efcb36816ab5b7:1
  { sat: 12425429610143, postage: 330 },   // piece 133 09a4dc170fd15d104afdb9f84c42fa3d2dc089c4d4676d0a35623118094157c1:1
  { sat: 12425429610144, postage: 330 },   // piece 134 3cb52eb14fcf8a4211dc1b257bb654f5c84f1145ca169f2822fc7630c125772b:1
  { sat: 12425429610145, postage: 330 },   // piece 135 843dcade738e0626e8339c8618bca83eaf30bd21573df66fbe27cede025c90c9:1
  { sat: 12425429610146, postage: 330 },   // piece 136 09103db028cb3c3988f93fb6bbce023ff88be3223b91ce43ae2bea16f5e62da4:1
  { sat: 12425429610147, postage: 330 },   // piece 137 dd1c50993821fc304ebe2bfc92784f242d19cba70e1e0f3b2a37cb11ea1bb4c7:1
  { sat: 12425429610148, postage: 330 },   // piece 138 b291e0d5d92440c78e5eb3af718eba3ab7612afd4cf4445af8e02dbf9c395ccc:1
  { sat: 12425429610149, postage: 330 },   // piece 139 fe9fc16f1c80a00755e13e013da12cf80aff7a41f14065af3cac5269035a53a5:1
  { sat: 12425429610150, postage: 330 },   // piece 140 9131d5e367c7b5246f6605fd1319bcd8d01b21386bb2545be0d792f5a2821c6b:1
  { sat: 12425429610151, postage: 330 },   // piece 141 1426193889a41cf2621d139dd6233a69b4aa6604a70bf312b0782e2f8e321eb7:1
  { sat: 12425429610152, postage: 330 },   // piece 142 16f0f1fdcd4fee107a2a63bfc559add96b81a573544be20cbcacb6226f3c181a:1
  { sat: 12425429610153, postage: 330 },   // piece 143 f8fc6bc28febaf2a8bd25f9ce2bf5f3ca69201ac6cffe71da566fcbe5b82616d:1
  { sat: 12425429610154, postage: 330 },   // piece 144 58c89f1009be193c0014783b5314a7ea510d0725ef0adb68db57e145935a43fc:1
  { sat: 12425429610155, postage: 330 },   // piece 145 5366003d69b9fb615ff099273c632a023e65e62bcd0ddd878351c1a882f6740d:1
  { sat: 12425429610156, postage: 330 },   // piece 146 31485e8288636afe7a416bab2c57438c3330377124d91db557a2a4daddbcc3c8:1
  { sat: 12425429610157, postage: 330 },   // piece 147 0ce3f40a746b0c71a62144dd39c685a96a096290609eb3dd091e1a8754864c3a:1
  { sat: 12425429610158, postage: 330 },   // piece 148 a1c243ab6d9af3eedeba68aea7abd7c4d6a182a11c144e23969fe011ab211ee9:1
  { sat: 12425429610159, postage: 330 },   // piece 149 f649c9dc81e3155fafe1e1b8bf43e87be980b6d9222426d60c8e2bec2ffea300:1
];

// SPARES — real carriers, but NOT assigned to pieces: they sit after a gap
// (they were peeled from chunk B before the switch to K=1 consecutive ordering).
// Use them only if the consecutive run is exhausted, or fold them in once
// chunk A's run reaches them. See memory/inscribe.md.
const SPARE_CARRIERS = [
  { sat: 12425429610463, postage: 330 },   // 00ca3bab0828b36c315dd4f8b98a024b216c4559ae665a416faa62b6620aa206:3
  { sat: 12425429610464, postage: 330 },   // 4070a87b10202aa7fd2df379ada5a2ed3ae850b9f81cd59c597b74508898dcb9:3
  { sat: 12425429610465, postage: 330 },   // 3360db2faaab9c7bf18cb012d6d4476596d94bb38352624934ec5b96f3162a03:3
];

const ENGINE_SAT = 1459982499999999; // dmvuhsnspyo — engine only, never a piece

// Remaining Omegas, held in ord-cold, deliberately unassigned:
//   cjcytrkpena 457095, adrejuehvqo 783299, adkoglpialm 785511,
//   abigrncmehu 803651, aaexuaaadws 813455, ytgwcbgmcw 826035

function carrierForPiece(index) {
  if (PIECE_CARRIERS.length === 0) {
    console.error('Error: PIECE_CARRIERS is empty.');
    console.error('  The rare range has to be split into carriers before anything can be');
    console.error('  inscribed, and each carrier recorded here with its first sat and its');
    console.error('  rare run. See memory/testing.md -> "Option 1 — pad the range into carriers".');
    process.exit(1);
  }
  const c = PIECE_CARRIERS[index];
  if (!c) {
    console.error(`Error: no carrier for piece ${index} — only ${PIECE_CARRIERS.length} recorded.`);
    console.error('  Split more rare range into carriers, or acquire more rare sats.');
    process.exit(1);
  }
  if (!Number.isInteger(c.sat) || !Number.isInteger(c.postage) || c.postage < 330) {
    console.error(`Error: carrier ${index} is malformed (postage must be an integer >= 330, the dust floor): ${JSON.stringify(c)}`);
    process.exit(1);
  }
  if (c.sat === ENGINE_SAT) {
    console.error(`Error: piece ${index} resolves to the engine's sat. Refusing.`);
    process.exit(1);
  }
  for (let i = 0; i < PIECE_CARRIERS.length; i++) {
    if (i !== index && PIECE_CARRIERS[i].sat === c.sat) {
      console.error(`Error: carrier ${index} and ${i} share sat ${c.sat}. Refusing.`);
      process.exit(1);
    }
  }
  return c;
}

'use strict';
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

// ── Parse + validate CLI args ─────────────────────────────────────────────────

const [,, rawIndex, rawHash, rawTimestamp, engineId] = process.argv;

const pieceIndex = parseInt(rawIndex, 10);
if (isNaN(pieceIndex) || pieceIndex < 0) {
  console.error('Error: pieceIndex must be 0 or greater');
  process.exit(1);
}
if (!engineId) {
  console.error('Error: engineId (5th argument) is required — the inscription ID of the engine');
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(rawHash)) {
  console.error('Error: blockHash must be a 64-character hex string');
  process.exit(1);
}
const inscriptionUnixSeconds = parseInt(rawTimestamp, 10);
if (isNaN(inscriptionUnixSeconds) || inscriptionUnixSeconds < 1000000000) {
  console.error('Error: blockUnixTimestamp must be a valid Unix timestamp (seconds)');
  process.exit(1);
}

// ── Derive lastTwoHashDigits from block hash ──────────────────────────────────
// Take the last byte of the hash string (2 hex chars = 0x00..0xFF),
// map to 0..99 via proportional rounding.
const lastTwoByte = parseInt(rawHash.slice(-2), 16);        // 0..255
const lastTwoHashDigits = Math.round(lastTwoByte * 99 / 255); // 0..99

// ── One block per piece ───────────────────────────────────────────────────────
// Lifespan is derived from the block hash. Two pieces sharing a block share a
// hash, therefore an identical hashTail, therefore an identical lifespan — and
// they would cease and reanimate in lockstep forever. Every piece must land in
// its own block.
//
// Broadcasting several inscriptions in quick succession is how this happens: they
// confirm together. Wait for piece N to confirm and read its real block before
// broadcasting N+1.
//
// The ledger below is written on every successful run and checked on the next
// one, so a reused block is refused rather than discovered later on chain.
// Kept outside dist/ deliberately: dist/ is gitignored and regenerated every run,
// and losing this file would silently disable the guard mid-mint. It is also the
// provenance record — which block each piece claimed, and the lifespan that block
// gave it — which nothing else in the repo captures.
const LEDGER = path.join(__dirname, 'inscribed_blocks.json');
let ledger = {};
if (existsSync(LEDGER)) {
  try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')); } catch (e) { ledger = {}; }
}
for (const [usedBy, rec] of Object.entries(ledger)) {
  if (parseInt(usedBy, 10) === pieceIndex) continue;   // re-running the same piece is fine
  if (rec.hash.toLowerCase() === rawHash.toLowerCase()) {
    console.error(`Error: block hash ...${rawHash.slice(-8)} was already used by piece ${usedBy}.`);
    console.error(`  Both pieces would derive hashTail ${lastTwoHashDigits} and share an identical lifespan.`);
    console.error(`  Wait for a new block and re-read the height and hash before minting piece ${pieceIndex}.`);
    process.exit(1);
  }
}

// ── Load health data in Node context ─────────────────────────────────────────
// Strip ES module syntax the same way build.js does, then eval.

function loadStripped(relPath) {
  let src = readFileSync(path.join(__dirname, relPath), 'utf8');
  src = src.replace(/^import\s+.*$/mg, '');
  src = src.replace(/^export\s*\{[^}]+\};\s*$/mg, '');
  return src;
}

const decaySrc  = loadStripped('./data/decay_logic.js');
const healthSrc = loadStripped('./data/health_data_sets.js');

const scope = {};
const setupFn = new Function(
  'scope_',
  decaySrc + '\n' + healthSrc + '\n' +
  'scope_.healthDataSets = healthDataSets;\n' +
  'scope_.minMaxValues = minMaxValues;\n' +
  'scope_.computeKarma = computeKarma;\n' +
  'scope_.computeLiberationThreshold = computeLiberationThreshold;\n' +
  'scope_.blendDatasets = blendDatasets;\n'
);
setupFn(scope);
const { healthDataSets, minMaxValues, computeKarma, computeLiberationThreshold, blendDatasets } = scope;

if (pieceIndex >= healthDataSets.length) {
  console.error(`Error: pieceIndex ${pieceIndex} out of range — only ${healthDataSets.length} datasets in health_data_sets.js`);
  console.error('Add the new health record to data/health_data_sets.js first.');
  process.exit(1);
}

// ── Replicate computeHSBFromStats from main.js ────────────────────────────────

function percentile(value, sortedArray) {
  if (sortedArray.length < 2) return 0.5;
  const rank = sortedArray.filter(v => v < value).length;
  return rank / (sortedArray.length - 1);
}

function computeHSBFromStats(dataSet, datasets) {
  const glucoseValues   = datasets.map(d => d.labs.glucose).slice().sort((a, b) => a - b);
  const potassiumValues = datasets.map(d => d.labs.potassium).slice().sort((a, b) => a - b);
  const egfrValues      = datasets.map(d => d.labs.eGFR).slice().sort((a, b) => a - b);
  return {
    hue: percentile(dataSet.labs.glucose,   glucoseValues),
    sat: percentile(dataSet.labs.potassium, potassiumValues),
    bri: percentile(dataSet.labs.eGFR,      egfrValues),
  };
}

const allInheritedHues = healthDataSets.map((_, i) =>
  computeHSBFromStats(healthDataSets[Math.max(0, i - 1)], healthDataSets).hue * 360
);

function getPartnerIndex(idx) {
  if (idx === 0) return -1;
  return idx % 2 === 0 ? idx + 1 : idx - 1;
}

function getPartnerInheritedHue(idx) {
  const p = getPartnerIndex(idx);
  if (p < 0 || p >= healthDataSets.length) return 0;
  return allInheritedHues[p];
}

// ── Compute baked values ──────────────────────────────────────────────────────

const partnerInheritedHueDeg = getPartnerInheritedHue(pieceIndex);
const BAKED_IS_LIBERATED     = 0.0;
const BAKED_VOID_PROGRESS    = 0.0;


const partnerIdx          = getPartnerIndex(pieceIndex);
const liberationThreshold = computeLiberationThreshold(healthDataSets, minMaxValues);
let karma = null;
if (partnerIdx >= 0 && partnerIdx < healthDataSets.length) {
  const [a, b] = pieceIndex % 2 === 0
    ? [healthDataSets[pieceIndex + 1], healthDataSets[pieceIndex]]
    : [healthDataSets[pieceIndex],     healthDataSets[pieceIndex - 1]];
  karma = computeKarma(blendDatasets(a, b), minMaxValues);
}

// ── Print summary ─────────────────────────────────────────────────────────────

console.log('\n=== Cessation Mint Bake ===');
console.log(`  Piece index              : ${pieceIndex}`);
console.log(`  Dataset date             : ${healthDataSets[pieceIndex].date}`);
console.log(`  Block hash (last 2 hex)  : ...${rawHash.slice(-2)} → lastTwoHashDigits = ${lastTwoHashDigits}`);
console.log(`  Inscription Unix time    : ${inscriptionUnixSeconds}  (${new Date(inscriptionUnixSeconds * 1000).toISOString()})`);
console.log(`  Partner index            : ${partnerIdx >= 0 ? partnerIdx : 'none'}`);
console.log(`  inheritedHueDeg (baked)  : ${allInheritedHues[pieceIndex].toFixed(2)}°`);
console.log(`  partnerInheritedHueDeg   : ${partnerInheritedHueDeg.toFixed(2)}°  (engine computes live, not baked)`);
if (karma !== null) {
  console.log(`  Pair karma               : ${karma.toFixed(4)}  |  threshold: ${liberationThreshold.toFixed(4)}  |  liberated at full cycle: ${karma < liberationThreshold}`);
}
console.log('');

// ── Shared: generate metadata JSON for --json-metadata flag ───────────────────
// Stored as CBOR in the inscription's metadata field — readable on-chain via /r/metadata/{id}.
// pieceIndex + hashTail + inscriptionUnix enable partner cycle computation at runtime.

const metadataObj = {
  pieceIndex:      pieceIndex,
  hashTail:        lastTwoHashDigits,
  inscriptionUnix: inscriptionUnixSeconds,
  dataset:         healthDataSets[pieceIndex],
};
const metadataName = `cessation_piece_${String(pieceIndex).padStart(2, '0')}_metadata.json`;
const distDir  = path.join(__dirname, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir);
writeFileSync(path.join(distDir, metadataName), JSON.stringify(metadataObj, null, 2), 'utf8');
console.log(`Metadata JSON written: dist/${metadataName}`);
console.log(`  Use with: ord wallet inscribe --json-metadata dist/${metadataName}\n`);

// ── All pieces: thin HTML — loads engine via <script src="/content/{engineId}"> ──
// Every piece is a child of the engine inscription (--parent engineId).
// The engine is the root. Piece 0 is the genesis art piece, not the inscription parent.
// Sibling discovery at runtime: extract engineId from _sc.src, fetch /r/children/{engineId}.

// Piece's own inherited hue (glucose hue of dataset[N-1], or own hue for piece 0).
// NOTE: partnerInheritedHueDeg above is the PARTNER's hue — used for display only,
// not baked here. The engine computes it live at runtime via getPartnerInheritedHue().
const hue = allInheritedHues[pieceIndex].toFixed(4);

const blockHeight = parseInt(process.argv[6], 10);
if (isNaN(blockHeight) || blockHeight < 0) {
  console.error('Error: blockHeight required as 6th argument');
  console.error('  node inscribe.js <N> <blockHash> <blockTimestamp> <engineId> <blockHeight>');
  process.exit(1);
}

const carrier = carrierForPiece(pieceIndex);
const satNumber = carrier.sat;

// Height check, now that blockHeight is parsed — same rule as the hash check above.
for (const [usedBy, rec] of Object.entries(ledger)) {
  if (parseInt(usedBy, 10) === pieceIndex) continue;
  if (rec.height === blockHeight) {
    console.error(`Error: block height ${blockHeight} was already used by piece ${usedBy}. Every piece needs its own block.`);
    process.exit(1);
  }
}

const scriptHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000}</style></head><body><script t="${pieceIndex}" ht="${lastTwoHashDigits}" unix="${inscriptionUnixSeconds}" hue="${hue}" block="${blockHeight}" src="/content/${engineId}"><\/script></body></html>`;

const outputName = `cessation_piece_${String(pieceIndex).padStart(2, '0')}.html`;
const outputDest = path.join(distDir, outputName);
writeFileSync(outputDest, scriptHtml, 'utf8');

console.log(`HTML written: dist/${outputName}  (${scriptHtml.length} bytes)`);
console.log(`Ready to inscribe: dist/${outputName}`);
console.log(`  ord wallet inscribe --fee-rate <FEE_RATE> --sat ${satNumber} --postage ${carrier.postage}sat --parent ${engineId} --file dist/${outputName} --json-metadata dist/${metadataName}`);
console.log('');
console.log(`  --postage ${carrier.postage}sat is not optional and must not be left to default:`);
console.log(`    it has to equal this carrier's FULL output size (${carrier.postage} sats). Set it lower and the`);
console.log("    reveal fee eats the rest of the run; ord's default of 10,000 swallows the");
console.log('    whole carrier. Measured both ways on regtest — see memory/testing.md.');
console.log('  Before running it:');
console.log('    - move only this carrier into the inscribing wallet');
console.log('    - keep every OTHER carrier locked (bitcoin-cli -rpcwallet=ord lockunspent false ...)');
console.log('      or ord will spend them as ordinary funding and destroy the rare sats');
console.log('    - afterwards, account for every rare sat by reading the block outputs');

// Record the block this piece claimed, so a later run cannot reuse it.
ledger[pieceIndex] = { height: blockHeight, hash: rawHash.toLowerCase(), hashTail: lastTwoHashDigits };
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), 'utf8');

const lifespans = Object.entries(ledger)
  .map(([i, r]) => `${i}:${r.hashTail}`)
  .join('  ');
console.log(`\nBlocks claimed so far (piece:hashTail) — every one must be a distinct block:`);
console.log(`  ${lifespans}`);
console.log(`\nWait for this inscription to confirm and read its real block before minting the next piece.`);
