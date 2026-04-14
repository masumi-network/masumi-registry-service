# Security Guidelines

## Overview

The Masumi Registry Service handles the registration aggregation service for MASUMI AI Nodes.

The service is not as critical as the masumi payment service, as it does not need access to hot wallets. However, there are still risks associated with the discovery of other agents and ranking them.

It is also in general good practice to follow security guidelines for any digital service.

## Security Best Practices

### Service Security

1. **Network Security**

   - Expose the service to public networks only if necessary
   - Otherwise use secure VPN or private network access
   - Implement necessary firewall rules

2. **Access Control**

   - Implement minimal role-based access control
   - Use strong API key authentication
   - Ensure API key confidentiality

3. **Data Protection**
   - Encrypt sensitive data at rest
   - Secure key management
   - Regular backup procedures

### Maintenance

1. **Updates**

   - Deploy regular security patches
   - Version control monitoring
   - Dependency updates

2. **Monitoring**

   - Check usage of the service to ensure it is not being abused

## Auditing

- Smart contracts are (currently) audited by [TxPipe](https://txpipe.io/)
- The payment service is not yet audited by a third Party. Do check the codebase before exposing it publicly

## Accepted Security Exceptions

- `rpcProviderApiKey` is intentionally visible to admin users. Treat admin API access, database access, and backups as equivalent to access to the underlying provider credentials.
- `@meshsdk/core` is currently pinned because upgrading it requires a coordinated smart-contract change. Review this exception periodically and compensate with a minimal production image, tighter outbound URL validation, and regular dependency review.

We follow security best practices, however this is in a MVP state. Any use is at your own risk.

(Note: If you want to host this as a paid service for third parties, please ensure security best practices are followed and consider auditing the service yourself)
