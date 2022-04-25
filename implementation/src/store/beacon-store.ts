import { ssz, altair } from '@chainsafe/lodestar-types';
import {
  defaultChainConfig,
  createIBeaconConfig,
  IBeaconConfig,
} from '@chainsafe/lodestar-config';
import { PublicKey } from '@chainsafe/bls';
import { computeSyncPeriodAtSlot } from '@chainsafe/lodestar-light-client/lib/utils/clock';
import { assertValidLightClientUpdate } from '@chainsafe/lodestar-light-client/lib/validation';
import { SyncCommitteeFast } from '@chainsafe/lodestar-light-client/lib/types';
import { ISyncStoreProver, ISyncStoreVerifer } from './isync-store';
import { BEACON_GENESIS_ROOT } from './constants';
import * as SyncUpdatesJson from './data/beacon-sync-updates.json';
import * as GenesisSnapshotJson from './data/beacon-genesis-snapshot.json';
import { isUint8ArrayEq } from '../utils';

const currentBeaconPeriod = computeSyncPeriodAtSlot(
  defaultChainConfig,
  parseInt(SyncUpdatesJson[SyncUpdatesJson.length - 1].header.slot),
);

// TODO: fix types
type BeaconUpdate = any;

export class BeaconChainStoreProver implements ISyncStoreProver<BeaconUpdate> {
  startPeriod: number;
  syncUpdates: altair.LightClientUpdate[];
  syncCommittees: Uint8Array[][];

  constructor(
    syncUpdatesJson: any[] = SyncUpdatesJson,
    genesisSnapshotJson: any = GenesisSnapshotJson,
  ) {
    this.syncUpdates = syncUpdatesJson.map(u =>
      ssz.altair.LightClientUpdate.fromJson(u),
    );
    const genesisSnapshot =
      ssz.altair.LightClientSnapshot.fromJson(genesisSnapshotJson);
    this.startPeriod = computeSyncPeriodAtSlot(
      defaultChainConfig,
      genesisSnapshot.header.slot,
    );

    // The nextSyncCommittee from the last update is not considered
    // as that is the sync committee in the upcomming period
    // The current/latest SyncCommittee is one in nextSyncCommittee
    // of the second last updates
    this.syncCommittees = [
      Array.from(genesisSnapshot.currentSyncCommittee.pubkeys) as Uint8Array[],
      ...this.syncUpdates
        .slice(0, -1)
        .map(u => Array.from(u.nextSyncCommittee.pubkeys) as Uint8Array[]),
    ];
  }

  getAllSyncCommittees(): {
    startPeriod: number;
    syncCommittees: Uint8Array[][];
  } {
    return {
      startPeriod: this.startPeriod,
      syncCommittees: this.syncCommittees,
    };
  }

  getSyncCommittee(period: number): Uint8Array[] {
    const index = period - this.startPeriod;
    if (index < 0)
      throw new Error(
        'requested period should not be lower than the genesis period',
      );
    return this.syncCommittees[index];
  }

  getSyncUpdate(period: number) {
    const index = period - this.startPeriod;
    if (index < 0)
      throw new Error(
        'requested period should not be lower than the genesis period',
      );
    return this.syncUpdates[index];
  }
}

// TODO: fix types
export class BeaconChainStoreClient implements ISyncStoreVerifer<BeaconUpdate> {
  beaconConfig: IBeaconConfig;
  genesisSyncCommittee: Uint8Array[];
  genesisPeriod: number;

  constructor(
    protected currentPeriod = currentBeaconPeriod,
    genesisSnapshotJson: any = GenesisSnapshotJson,
  ) {
    this.beaconConfig = createIBeaconConfig(
      defaultChainConfig,
      BEACON_GENESIS_ROOT,
    );

    const genesisSnapshot =
      ssz.altair.LightClientSnapshot.fromJson(genesisSnapshotJson);
    this.genesisSyncCommittee = Array.from(
      genesisSnapshot.currentSyncCommittee.pubkeys,
    ) as Uint8Array[];

    this.genesisPeriod = computeSyncPeriodAtSlot(
      defaultChainConfig,
      genesisSnapshot.header.slot,
    );
  }

  private deserializePubkeys(pubkeys: Uint8Array[]): PublicKey[] {
    return pubkeys.map(pk => PublicKey.fromBytes(pk));
  }

  // This function is ovveride of the original function in
  // @chainsafe/lodestar-light-client/lib/utils/utils
  // this was required as the light client doesn't have access
  // to aggregated signatures
  private deserializeSyncCommittee(
    syncCommittee: Uint8Array[],
  ): SyncCommitteeFast {
    const pubkeys = this.deserializePubkeys(syncCommittee);
    return {
      pubkeys,
      aggregatePubkey: PublicKey.aggregate(pubkeys),
    };
  }

  syncUpdateVerify(
    prevCommittee: Uint8Array[],
    currentCommittee: Uint8Array[],
    update: BeaconUpdate,
  ): boolean {
    // check if update.nextSyncCommittee is currentCommittee
    const isUpdateValid = update.nextSyncCommittee.every(
      (c: Uint8Array, i: number) =>
      isUint8ArrayEq(currentCommittee[i], c),
    );
    if (!isUpdateValid) return false;

    const prevCommitteeFast = this.deserializeSyncCommittee(prevCommittee);
    try {
      // check if the update has valid signatures
      assertValidLightClientUpdate(
        this.beaconConfig,
        prevCommitteeFast,
        update,
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  getGenesisSyncCommittee(): Uint8Array[] {
    return this.genesisSyncCommittee;
  }

  getCurrentPeriod(): number {
    return this.currentPeriod;
  }

  getGenesisPeriod(): number {
    return this.genesisPeriod;
  }
}
