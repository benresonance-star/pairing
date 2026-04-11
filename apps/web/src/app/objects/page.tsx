import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createPackageAssignmentChangeSet, getObjects, getPackages } from "../../lib/demo-store";

async function draftPackageAssignment(formData: FormData) {
  "use server";

  try {
    const result = await createPackageAssignmentChangeSet({
      objectRefType: formData.get("objectRefType") as "zone" | "model_object",
      objectRefId: String(formData.get("objectRefId")),
      packageId: String(formData.get("packageId"))
    });

    revalidatePath("/objects");
    revalidatePath("/change-sets");
    revalidatePath("/");
    redirect(`/objects?status=${encodeURIComponent(`Draft created for ${result.targetLabel}`)}`);
  } catch (error) {
    redirect(`/objects?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create draft change set")}`);
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ObjectsPage({ searchParams }: PageProps) {
  const objects = await getObjects();
  const packages = await getPackages();
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="panel">
      <h2>Objects And Zones</h2>
      <p className="muted">
        Draft a package assignment change set for any synced zone or first-slice model object.
      </p>
      {status ? <div className="notice notice-success">{status}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Label</th>
            <th>Storey</th>
            <th>Zone Key</th>
            <th>Current Package</th>
            <th>Construction State</th>
            <th>Draft Package Change</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((object) => (
            (() => {
              const availablePackages = packages.filter(
                (pkg) => pkg.package_id !== object.currentPackageId
              );
              return (
                <tr key={object.id}>
                  <td>
                    <span className="tag">{object.objectRefType}</span>
                  </td>
                  <td>{object.label}</td>
                  <td>{object.storey}</td>
                  <td>{object.zoneKey}</td>
                  <td>{object.currentPackageId ?? "unassigned"}</td>
                  <td>{object.constructionState ?? "unset"}</td>
                  <td>
                    {availablePackages.length === 0 ? (
                      <span className="muted">No alternate package available</span>
                    ) : (
                      <form action={draftPackageAssignment} className="inline-form">
                        <input type="hidden" name="objectRefType" value={object.objectRefType} />
                        <input type="hidden" name="objectRefId" value={object.id} />
                        <select name="packageId" defaultValue="">
                          <option value="" disabled>
                            Select package
                          </option>
                          {availablePackages.map((pkg) => (
                            <option key={pkg.id} value={pkg.package_id}>
                              {pkg.package_id}
                            </option>
                          ))}
                        </select>
                        <button type="submit">Create Draft</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })()
          ))}
        </tbody>
      </table>
    </section>
  );
}
