import { $Enums } from '@prisma/client';

type ScriptRedeemer = {
  tx_hash: string;
  tx_index: number;
  purpose: 'spend' | 'mint' | 'cert' | 'reward';
  redeemer_data_hash: string;
  datum_hash: string;
  unit_mem: string;
  unit_steps: string;
  fee: string;
};
export type ScriptRedeemersResponse = ScriptRedeemer[];

export async function getScriptsRedeemers(
  network: $Enums.Network,
  blockfrostToken: string,
  policyId: string,
  page: number
) {
  const result = await fetch(
    `https://cardano-${network == $Enums.Network.Mainnet ? 'mainnet' : 'preprod'}.blockfrost.io/api/v0/scripts/${policyId}/redeemers?count=100&page=${page}&order=asc`,
    {
      headers: {
        project_id: blockfrostToken,
      },
    }
  );
  if (!result.ok) {
    throw new Error('Failed to get scripts redeemers');
  }
  const json = await result.json();
  const data = json as ScriptRedeemersResponse;
  return data;
}

type UtxoAmounts = {
  amount: ReadonlyArray<{ unit: string; quantity: string }>;
};

// Net quantity change per asset of the policy within one tx:
// positive = mint, negative = burn.
export function getPolicyAssetQuantityChanges(
  txsUtxos: {
    inputs: ReadonlyArray<UtxoAmounts>;
    outputs: ReadonlyArray<UtxoAmounts>;
  },
  policyId: string
): Map<string, number> {
  const mintedOrBurnedAssetsOfPolicy = new Map<string, number>();
  for (const inputUtxo of txsUtxos.inputs) {
    for (const asset of inputUtxo.amount) {
      if (asset.unit.startsWith(policyId)) {
        mintedOrBurnedAssetsOfPolicy.set(asset.unit, -parseInt(asset.quantity));
      }
    }
  }
  for (const outputUtxo of txsUtxos.outputs) {
    for (const asset of outputUtxo.amount) {
      if (asset.unit.startsWith(policyId)) {
        mintedOrBurnedAssetsOfPolicy.set(
          asset.unit,
          (mintedOrBurnedAssetsOfPolicy.get(asset.unit) ?? 0) +
            parseInt(asset.quantity)
        );
      }
    }
  }
  return mintedOrBurnedAssetsOfPolicy;
}
