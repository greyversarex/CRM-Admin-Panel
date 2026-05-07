import { Layout } from "@/components/layout";
import { ReleaseWizard } from "@/components/release-wizard/wizard";

export default function CreateRelease() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <ReleaseWizard initialReleaseId={null} />
      </div>
    </Layout>
  );
}
