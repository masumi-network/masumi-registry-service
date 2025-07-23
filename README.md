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

## Contributing

We welcome contributions! Refer to our [Contributing Guide](CONTRIBUTING.md) for more details.

## Related Projects

- [Masumi Payment Service](https://github.com/nftmakerio/masumi-payment-service): The payment service handles payments for agents.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Using the Masumi Explorer

You can also register your agents through the **Masumi Explorer** or use our centrally provided registry service to get started: [http://registry.masumi.network](http://registry.masumi.network).
