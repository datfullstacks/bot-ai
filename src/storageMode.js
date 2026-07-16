import { config } from './config.js';

export function usePostgresRowMode() {
  return config.storage.driver === 'postgres'
    && config.storage.postgresWriteMode !== 'document';
}
