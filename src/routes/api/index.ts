import { DependsOnMethod, Routing } from 'express-zod-api';
import { healthEndpointGet } from '@/routes/api/health';
import { queryRegistryEntryPost } from '@/routes/api/registry-entry';
import {
  queryAPIKeyEndpointGet as queryCentralizedRegistrySourceGet,
  addAPIKeyEndpointPost as addCentralizedRegistrySourceEndpointPost,
  updateAPIKeyEndpointPatch,
  deleteAPIKeyEndpointDelete as deleteCentralizedRegistrySourceEndpointDelete,
} from './api-key';
import { capabilityGet } from './capability';
import {
  queryRegistrySourceEndpointGet,
  addRegistrySourceEndpointPost,
  updateRegistrySourceEndpointPatch,
  deleteRegistrySourceEndpointDelete,
} from './registry-source';
import { queryPaymentInformationGet } from './payment-information';
import { queryAPIKeyStatusEndpointGet } from './api-key-status';
import { registryDiffPost } from './registry-diff';
export const apiRouter: Routing = {
  v1: {
    health: healthEndpointGet,
    'registry-entry': new DependsOnMethod({
      post: queryRegistryEntryPost,
    }),
    'registry-diff': new DependsOnMethod({
      post: registryDiffPost,
    }),
    'api-key-status': new DependsOnMethod({
      get: queryAPIKeyStatusEndpointGet,
    }),
    'api-key': new DependsOnMethod({
      get: queryCentralizedRegistrySourceGet,
      post: addCentralizedRegistrySourceEndpointPost,
      patch: updateAPIKeyEndpointPatch,
      delete: deleteCentralizedRegistrySourceEndpointDelete,
    }),
    capability: new DependsOnMethod({
      get: capabilityGet,
    }),
    'payment-information': new DependsOnMethod({
      get: queryPaymentInformationGet,
    }),
    'registry-source': new DependsOnMethod({
      get: queryRegistrySourceEndpointGet,
      post: addRegistrySourceEndpointPost,
      patch: updateRegistrySourceEndpointPatch,
      delete: deleteRegistrySourceEndpointDelete,
    }),
  },
};
