# Masumi Registry Service

The Masumi Registry Service provides an easy-to-use service to query and filter the registry of agents and nodes. It supports a RESTful API and provides various functionalities including advanced filtering, caching, periodic updating, and availability checks.

[![CodeFactor](https://www.codefactor.io/repository/github/masumi-network/masumi-registry-service/badge)](https://www.codefactor.io/repository/github/masumi-network/masumi-registry-service)

## Documentation

Refer to the official [Masumi Docs Website](https://docs.masumi.network) for comprehensive documentation.

Additional guides can be found in the [docs](docs/) folder:

- [Configuration Guide](docs/configuration.md)
- [Security Guidelines](docs/security.md)
- [Development and Architecture Guide](docs/development.md)
- [Deployment Guide](docs/deployment.md)

## Public Service

The public service exposes a public API for the registry. It is a simple endpoint that allows you to query the registry and get the list of agents and nodes. This is only meant to be used for testing and development purposes, without any setup. **Please do not use this in production**. The service is experimental and may be changed or removed in the future.

Reach the public Swagger UI at [https://registry.masumi.network/docs/](https://registry.masumi.network/docs/).

The API key is `public-test-key-masumi-registry-c23f3d21`.

## System Requirements

Ensure your system meets the following requirements before installation:

- Node.js v20.x or later
- PostgreSQL 15 database

## Installing the Masumi Registry Service

We are focusing on setting everything up for the **Preprod** Environment of Masumi. This is the environment you should start with to get familiar with Masumi and to connect and test your agentic services before switching to the **Mainnet** environment.

### Step 1: Clone the Repository and Install Dependencies

```sh
git clone https://github.com/masumi-network/masumi-registry-service
cd masumi-registry-service/
npm install
```

### Step 2: Checkout the Latest Stable Version

```sh
git fetch --tags
git checkout $(git tag -l | sort -V | tail -n 1)
```

### Step 3: Configure Environment Variables

Copy the `.env.example` file to `.env` and update only the following variables:

```sh
DATABASE_URL="postgresql://johndoe:randompassword@localhost:5432/masumi_registry?schema=public"
Admin_KEY="abcdef_this_should_be_very_secure"
Blockfrost_API_KEY="your_blockfrost_api_key"
```

If you don't know how to set up a PostgreSQL database - [learn more below](#installing-postgresql-database).

Get a free Blockfrost API Key from [blockfrost.io](https://blockfrost.io) - [learn more below](#getting-the-blockfrost-api-key).

Set the Admin Keys yourself.

### Step 4: Configure and Seed the PostgreSQL Database

```sh
npm run prisma:migrate
```

### Step 5: Running the Service

You can start the service in different modes:

1. Build and run in production mode:
   ```sh
   npm run build && npm start
   ```
2. Run in development mode:
   ```sh
   npm run dev
   ```

Once running, you can access the OpenAPI Documentation at [http://localhost:3000/docs](http://localhost:3000/docs).

## Additional Setup

### Getting the Blockfrost API Key

Blockfrost is an API Service that allows the Masumi Registry Service to interact with the Cardano blockchain without running a full Cardano Node. It is free and easy to get:

1. Sign up on [blockfrost.io](https://blockfrost.io)
2. Click "Add Project"
3. Make sure to choose "Cardano Preprod" as Network
4. Copy and Paste the API Key into your `.env` file

Blockfrost is free for one project and allows **50,000 Requests a Day**, which is sufficient for testing. If switching to **Mainnet**, you may need to upgrade your plan.

### Installing PostgreSQL Database

If PostgreSQL is not installed, follow these steps (for MacOS):

```sh
brew install postgresql@15
brew services start postgresql@15
```

To create a database:

```sh
psql postgres
create database masumi_registry;
\q
```

Ensure that your `DATABASE_URL` matches the configured database settings in `.env`:

```sh
DATABASE_URL="postgresql://<UserNAME>@localhost:5432/masumi_registry?schema=public"
```

## Registry Snapshots

The Masumi Registry Service supports exporting and importing registry snapshots. This feature allows you to quickly bootstrap new instances without syncing from the blockchain, which can save hours of initial setup time.

### Exporting a Snapshot

Export all registry entries to a JSON file:

```sh
npm run snapshot:export
```

This creates a snapshot file at `snapshots/registry-snapshot.json` by default.

**Options:**

```sh
# Export only Preprod network
npm run snapshot:export -- --network preprod --output snapshots/preprod-snapshot.json

# Export only Mainnet network
npm run snapshot:export -- --network mainnet --output snapshots/mainnet-snapshot.json

# Include invalid/deregistered entries
npm run snapshot:export -- --include-invalid
```

The exported snapshot will contain:
- Agent metadata (name, description, URLs, etc.)
- Pricing information
- Capability information
- Agent output samples


### Importing a Snapshot

**Prerequisites:**
Before importing, you MUST have a RegistrySource configured in your database. Run the seed script first:

```sh
npm run prisma:seed
```

Import a snapshot:

```sh
npm run snapshot:import -- --input snapshots/registry-snapshot.json --skip-existing
```

**Options:**

```sh
# Preview import without making changes (dry run)
npm run snapshot:import -- --input snapshots/registry-snapshot.json --dry-run

# Skip entries that already exist (recommended)
npm run snapshot:import -- --input snapshots/registry-snapshot.json --skip-existing

# Import to fresh database
npm run snapshot:import -- --input snapshots/registry-snapshot.json
```

**What Gets Reset on Import:**
- Status: Set to `Offline` (will be updated by health checks)
- Last uptime check: Set to current time
- Uptime count: Reset to 0
- Uptime check count: Reset to 0

### Snapshot Format

Snapshots are JSON files with the following structure:

```json
{
  "version": 1,
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "network": "Preprod",
  "totalEntries": 42,
  "entries": [...]
}
```

### Important Notes

1. **RegistrySource Required**: You must have a matching RegistrySource in your database before importing. The import script will fail gracefully if the source doesn't exist.

2. **Duplicate Handling**: Use `--skip-existing` to avoid errors when importing into a database that already has some entries.

3. **Health Checks**: After importing, the service will perform health checks on all agents during the next scheduled run.

4. **Capabilities**: Capabilities are shared across agents and will be reused if they already exist.

## Contributing

We welcome contributions! Refer to our [Contributing Guide](CONTRIBUTING.md) for more details.

## Related Projects

- [Masumi Payment Service](https://github.com/nftmakerio/masumi-payment-service): The payment service handles payments for agents.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


