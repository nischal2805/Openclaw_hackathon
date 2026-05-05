export interface RegistryIndex {
  contracts: RegistryEntry[];
  last_updated: string;
}

export interface RegistryEntry {
  contract_id: string;
  counterparty: string;
  end_date: string | null;
  obligation_count: number;
  registered_at: string;
  source_filename: string;
  version: number;
}
