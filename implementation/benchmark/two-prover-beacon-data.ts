import { init } from '@chainsafe/bls';
import {
  BeaconStoreProver,
  BeaconStoreVerifier,
} from '../src/store/beacon-store';
import { Prover } from '../src/prover/prover';
import { SuperlightClient } from '../src/client/superlight-client';
import { LightClient } from '../src/client/light-client';
import { generateRandomSyncCommittee } from '../src/utils';

async function main() {
  await init('blst-native');

  const beaconStoreProverH = new BeaconStoreProver();

  const committee = generateRandomSyncCommittee();
  const beaconStoreProverD = new BeaconStoreProver([{ index: 3, committee }]);

  const honestBeaconProver = new Prover(beaconStoreProverH);
  const dishonestBeaconProver = new Prover(beaconStoreProverD);

  const beaconStoreVerifer = new BeaconStoreVerifier();
  const superLightClient = new SuperlightClient(beaconStoreVerifer, [
    dishonestBeaconProver,
    honestBeaconProver,
  ]);
  const resultSL = await superLightClient.sync();
  console.log(
    `SuperlighClient found [${resultSL.map(
      r => r.index,
    )}] as honest provers \n`,
  );

  const lightClient = new LightClient(beaconStoreVerifer, [
    dishonestBeaconProver,
    honestBeaconProver,
  ]);
  const resultL = await lightClient.sync();
  console.log(`Lightclient found ${resultL.index} as the first honest prover`);
}

main().catch(err => console.error(err));
