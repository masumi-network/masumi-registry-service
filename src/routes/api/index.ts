import { Routing } from 'express-zod-api';
import { healthEndpointGet } from '@/routes/api/health';
import {
  queryRegistryEntryPost,
  refreshRegistryEntryPost,
  searchRegistryEntryPost,
} from '@/routes/api/registry-entry';
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
import {
  queryInboxAgentRegistrationPost,
  refreshInboxAgentRegistrationPost,
  searchInboxAgentRegistrationPost,
} from './inbox-agent-registration';
import { inboxAgentRegistrationDiffPost } from './inbox-agent-registration-diff';
export const apiRouter: Routing = {
  v1: {
    health: healthEndpointGet,
    'registry-entry': {
      post: queryRegistryEntryPost,
    },
    'registry-entry-search': {
      post: searchRegistryEntryPost,
    },
    'registry-entry-refresh': {
      post: refreshRegistryEntryPost,
    },
    'registry-diff': {
      post: registryDiffPost,
    },
    'inbox-agent-registration': {
      post: queryInboxAgentRegistrationPost,
    },
    'inbox-agent-registration-search': {
      post: searchInboxAgentRegistrationPost,
    },
    'inbox-agent-registration-refresh': {
      post: refreshInboxAgentRegistrationPost,
    },
    'inbox-agent-registration-diff': {
      post: inboxAgentRegistrationDiffPost,
    },
    'api-key-status': {
      get: queryAPIKeyStatusEndpointGet,
    },
    'api-key': {
      get: queryCentralizedRegistrySourceGet,
      post: addCentralizedRegistrySourceEndpointPost,
      patch: updateAPIKeyEndpointPatch,
      delete: deleteCentralizedRegistrySourceEndpointDelete,
    },
    capability: {
      get: capabilityGet,
    },
    'payment-information': {
      get: queryPaymentInformationGet,
    },
    'registry-source': {
      get: queryRegistrySourceEndpointGet,
      post: addRegistrySourceEndpointPost,
      patch: updateRegistrySourceEndpointPatch,
      delete: deleteRegistrySourceEndpointDelete,
    },
  },
};
