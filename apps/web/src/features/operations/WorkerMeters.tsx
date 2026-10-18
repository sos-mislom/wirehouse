import { ReadingsWorkspace } from "../business/ReadingsWorkspace";
export function WorkerMeters({ userId }: { token: string; userId: string }) {
  return (
    <article className="surface worker-meters">
      <h3>Мои счетчики</h3>
      <ReadingsWorkspace workerId={userId} />
    </article>
  );
}
