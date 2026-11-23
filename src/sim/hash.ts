/** Uniform spatial hash over typed arrays. No allocations in queries. */
export interface SpatialHash {
  cellSize: number;
  readonly tableSize: number;
  readonly head: Int32Array;
  readonly next: Int32Array;
  clear(): void;
  insert(i: number, x: number, y: number, z: number): void;
}

export function createSpatialHash(
  capacity: number,
  cellSize: number,
  tableSize = 8192,
): SpatialHash {
  const head = new Int32Array(tableSize);
  const next = new Int32Array(capacity);
  const hash = {
    cellSize,
    tableSize,
    head,
    next,
    clear() {
      head.fill(-1);
    },
    insert(i: number, x: number, y: number, z: number) {
      const ix = Math.floor(x / cellSize);
      const iy = Math.floor(y / cellSize);
      const iz = Math.floor(z / cellSize);
      // Large primes for spatial hashing.
      let h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
      h &= tableSize - 1;
      if (h < 0) h += tableSize;
      next[i] = head[h];
      head[h] = i;
    },
  };
  hash.clear();
  return hash;
}

export function forEachNeighbor(
  hash: SpatialHash,
  x: number,
  y: number,
  z: number,
  fn: (j: number) => void,
): void {
  const cs = hash.cellSize;
  const ix = Math.floor(x / cs);
  const iy = Math.floor(y / cs);
  const iz = Math.floor(z / cs);
  const { head, next, tableSize } = hash;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        let h = ((ix + dx) * 73856093) ^ ((iy + dy) * 19349663) ^ ((iz + dz) * 83492791);
        h &= tableSize - 1;
        if (h < 0) h += tableSize;
        for (let j = head[h]; j !== -1; j = next[j]) fn(j);
      }
    }
  }
}
