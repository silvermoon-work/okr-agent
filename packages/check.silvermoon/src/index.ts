import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";

export async function verifyArtifact(
  bytes: Uint8Array,
  expectedCid: string,
): Promise<string> {
  const car = await readTaskBundleCar(
    new Blob([Uint8Array.from(bytes)]).stream(),
  );
  try {
    if (car.cid !== expectedCid)
      throw new Error("CAR root does not match the fixed Check CID.");
    return car.cid;
  } finally {
    await car.close();
  }
}
