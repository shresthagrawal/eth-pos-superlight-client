import { logFloor, concatUint8Array, isUint8ArrayEq } from './utils';
import { toHexString } from '@chainsafe/ssz';

export type Node = {
  hash: Uint8Array;
  parent?: Node;
  children?: Node[];
  isRoot: boolean;
  isLeaf: boolean;
};

export type HashFunction = (data: Uint8Array) => Uint8Array;

export class MerkleTree {
  protected root: Node;
  protected lookupMap: { [hashHex: string]: Node } = {};
  protected leaves: Node[] = [];

  constructor(protected hashFn: HashFunction, protected n: number = 2) {}

  init(leaves: Uint8Array[]) {
    const l = leaves.length;
    if (!l) throw new Error(`there should be atleast one leaf`);

    if (l !== this.n ** logFloor(l, this.n))
      throw new Error(`leaves should be exact power of n(${this.n})`);

    let lastLayer: Node[] = leaves.map(l => ({
      hash: l,
      isLeaf: true,
      isRoot: false,
    }));
    lastLayer.forEach(n => (this.lookupMap[toHexString(n.hash)] = n));
    this.leaves = lastLayer;

    while (lastLayer.length > 1) {
      const nextLayerSize = lastLayer.length / this.n;
      const nextLayer: Node[] = [];
      for (let i = 0; i < nextLayerSize; i++) {
        const children = lastLayer.slice(i * this.n, (i + 1) * this.n);
        const hash = this.hashFn(concatUint8Array(children.map(c => c.hash)));
        const n: Node = {
          hash,
          children,
          isRoot: false,
          isLeaf: false,
        };
        this.lookupMap[toHexString(hash)] = n;
        nextLayer.push(n);
        children.forEach(c => (c.parent = n));
      }
      lastLayer = nextLayer;
    }

    lastLayer[0].isRoot = true;
    this.root = lastLayer[0];
  }

  getNode(hash: Uint8Array): Node {
    return this.lookupMap[toHexString(hash)];
  }

  generateProof(index: number): Uint8Array[][] {
    let result = [];
    let curr = this.leaves[index];
    if (!curr) throw new Error('index out of range');
    while (!curr.isRoot && curr.parent) {
      const siblings = curr.parent.children!.filter(n =>
        isUint8ArrayEq(n.hash, curr.hash),
      );
      result.push(siblings.map(s => s.hash));
      curr = curr.parent;
    }
    return result;
  }

  get size() {
    return this.leaves.length;
  }

  getRoot(dept: number = 0) {
    let root = this.root;
    for (let i = 0; i < dept; i++) {
      if (!root.children) throw new Error('dept too big for the tree');
      root = root.children[0];
    }
    return root;
  }
}

export function merkleVerify(
  leaf: Uint8Array,
  index: number,
  root: Uint8Array,
  proof: Uint8Array[][],
  hashFn: HashFunction,
  n: number = 2,
): boolean {
  let value = leaf;
  for (let i = 0; i < proof.length; i++) {
    const pos = Math.floor(index / n ** i) % n;
    value = hashFn(concatUint8Array(proof[i].splice(pos, 0, value)));
  }
  return isUint8ArrayEq(value, root);
}