import { MainLayout } from '@/components/layout/MainLayout';

export default function Dashboard() {
  return (
    <MainLayout>
      <section aria-labelledby="dashboard-heading" className="space-y-2">
        <h1 id="dashboard-heading" className="text-2xl font-semibold tracking-tight">
          Registry Admin
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Agents, registry sources and API keys will be managed here.
        </p>
      </section>
    </MainLayout>
  );
}
