import { getLinearScheduleData } from "../../lib/demo-store";
import type { LinearActivityType } from "../../../../../shared/contracts/api/index";
import LinearScheduleClient from "./schedule-client";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LinearSchedulePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const packageIds =
    typeof params.packageId === "string"
      ? [params.packageId]
      : Array.isArray(params.packageId)
        ? params.packageId.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [];
  const filters = {
    scenarioId: typeof params.scenarioId === "string" ? params.scenarioId : null,
    packageIds,
    workfront: typeof params.workfront === "string" ? params.workfront : null,
    activityType:
      typeof params.activityType === "string" ? (params.activityType as LinearActivityType) : null
  };

  const data = await getLinearScheduleData(filters);

  return <LinearScheduleClient data={data} filters={filters} />;
}
