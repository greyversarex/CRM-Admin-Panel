import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { ReleaseWizard } from "@/components/release-wizard/wizard";

export default function EditRelease() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground">
          Неверный идентификатор релиза.
        </div>
      </Layout>
    );
  }
  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <ReleaseWizard initialReleaseId={id} />
      </div>
    </Layout>
  );
}
