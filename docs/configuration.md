# Configuration

Configure the environment variables by copying the `.env.example` file to `.env`or `.env.local` and setup the
variables

- **DATABASE_URL**: The endpoint for a PostgreSQL database to be used
- **PORT**: The port to run the server on (default is 3000)
- **CORS_ALLOWED_ORIGINS**: A comma-separated allowlist of additional browser origins that may call the API cross-origin. Leave unset to avoid wildcard browser CORS exposure.

If you're setting up the database for the first time (or want to provide some initial data) you also need the
following variables before seeding:

- **Blockfrost_API_KEY**: An API Key from [https://blockfrost.io/](https://blockfrost.io/) for the correct blockchain network, you can create this for free
- **REGISTRY_SOURCE_NETWORK**: Preprod or Mainnet
- **Admin_KEY**: The key of the admin user, this key will have all permissions and can create new api_keys

## Schedules

The registry is updated every 2 minutes and the deregistered entries are updated every 3 minutes. You can change these schedules in the `.env` file.

- **UPDATE_CARDANO_REGISTRY_INTERVAL**: The interval in seconds to update the registry
- **UPDATE_CARDANO_DEREGISTER_INTERVAL**: The interval in seconds to update the deregistered entries
