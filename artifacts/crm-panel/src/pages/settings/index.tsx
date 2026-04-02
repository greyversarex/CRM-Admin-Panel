import { Layout } from "@/components/layout";

export default function Settings() {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <div className="text-muted-foreground">System settings.</div>
      </div>
    </Layout>
  );
}