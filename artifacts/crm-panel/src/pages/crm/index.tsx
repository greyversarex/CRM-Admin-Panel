import { Layout } from "@/components/layout";

export default function CRM() {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
        <div className="text-muted-foreground">Manage contacts and tasks.</div>
      </div>
    </Layout>
  );
}