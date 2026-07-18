import { useParams } from "wouter";
import CreateRelease from "@/pages/releases/new";

// Редактирование релиза — та же страница, что и создание (/releases/new),
// но с загруженными данными существующего релиза (editId).
export default function EditRelease() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-sm text-muted-foreground">
        Неверный идентификатор релиза.
      </div>
    );
  }
  return <CreateRelease editId={id} />;
}
