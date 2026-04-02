import { Layout } from "@/components/layout";

export default function Users() {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <div className="text-muted-foreground">User management.</div>
      </div>
    </Layout>
  );
}