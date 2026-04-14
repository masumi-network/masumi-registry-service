import { readFileSync } from 'fs';
import { join } from 'path';

describe('container hardening', () => {
  it('does not copy env files or source files into the runtime image', () => {
    const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');

    expect(dockerfile).not.toContain('COPY .env* ./');
    expect(dockerfile).not.toContain(
      'COPY --from=builder /usr/src/app/src ./src'
    );
    expect(dockerfile).toContain('USER node');
  });

  it('excludes env files from the docker build context', () => {
    const dockerignore = readFileSync(
      join(process.cwd(), '.dockerignore'),
      'utf8'
    );

    expect(dockerignore).toContain('.env*');
  });
});
