import { Layout } from "@/components/layout";

export default function Analytics() {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <div className="text-muted-foreground">Analytics dashboard.</div>
      </div>
    </Layout>
  );
}