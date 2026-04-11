import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { actionsForStatus, getChangeSets, transitionChangeSet } from "../../lib/demo-store";

async function moveChangeSet(formData: FormData) {
  "use server";

  try {
    const nextStatus = await transitionChangeSet(
      String(formData.get("changeSetId")),
      String(formData.get("action")) as "submit" | "approve" | "queue"
    );
    revalidatePath("/change-sets");
    revalidatePath("/");
    redirect(`/change-sets?status=${encodeURIComponent(`Change set moved to ${nextStatus}`)}`);
  } catch (error) {
    redirect(`/change-sets?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to move change set")}`);
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChangeSetsPage({ searchParams }: PageProps) {
  const changeSets = await getChangeSets();
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="panel">
      <h2>Change Sets</h2>
      <p className="muted">
        Move package assignment changes through draft, submit, approve, and queue. Once queued,
        run the connector outbound command to record the `CCP_PackageID` write-back payload.
      </p>
      {status ? <div className="notice notice-success">{status}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Items</th>
            <th>First Item</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {changeSets.map((changeSet) => (
            <tr key={changeSet.id}>
              <td>
                <div>{changeSet.title}</div>
                {changeSet.syncErrors.length > 0 ? (
                  <div className="muted">Errors: {changeSet.syncErrors.join(", ")}</div>
                ) : null}
              </td>
              <td>
                <span className="tag">{changeSet.status}</span>
              </td>
              <td>{changeSet.itemCount}</td>
              <td>
                {changeSet.firstField ? `${changeSet.firstField} -> ${changeSet.firstValue}` : "n/a"}
              </td>
              <td>{changeSet.submittedAt ?? "not submitted"}</td>
              <td>
                <div className="actions">
                  {actionsForStatus(changeSet.status).map((action) => (
                    <form key={action} action={moveChangeSet}>
                      <input type="hidden" name="changeSetId" value={changeSet.id} />
                      <input type="hidden" name="action" value={action} />
                      <button type="submit">{action}</button>
                    </form>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
