# Deployment Guide

You can deploy it to any cloud service which can handle docker images.

Popular services are [AWS](https://aws.amazon.com/), [GCP](https://cloud.google.com/), [Azure](https://azure.microsoft.com/) or
[Digital Ocean](https://www.digitalocean.com/)

We recommend also using a PostgreSQL database service and do backups of the database and especially wallet data.

## Run with Docker

1. Create the `.env` file with the correct values or inject the values at container runtime (migrate the database and
   optionally seed it first). The production image does not copy `.env` files into the container.
2. Build:

   ```
   docker build -t masumi-registry-service .
   ```

3. Run
   ```
   docker run -d -p 3000:3000 masumi-registry-service
   ```
   Replacing `masumi-registry-service` with the image name, and `3000:3000` with the `host:container` ports to
   publish.

Otherwise you can run the project locally by following the Quickstart guide in the [README](../README.md)
