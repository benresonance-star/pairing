"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import LinearScheduleClient from "../../linear-schedule/schedule-client";
import type { ScenarioEditorOperationalRow } from "../../../lib/demo-store";
import type { LinearScheduleData } from "../../../lib/linear-schedule";

type Props = {
  scenarioId: string;
  data: LinearScheduleData;
  operationalRows: ScenarioEditorOperationalRow[];
  selectedActivityId: string | null;
  selectedOperationalId: string | null;
};

export default function ScenarioEditorVisuals({
  scenarioId,
  data,
  operationalRows,
  selectedActivityId,
  selectedOperationalId
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const operationalIdByObjectRef = useMemo(
    () =>
      new Map<string, string>(
        operationalRows.map((row) => [`${row.objectRefType}:${row.objectRefId}`, row.id])
      ),
    [operationalRows]
  );

  const handleSelectedActivityChange = useCallback(
    (nextActivityId: string | null) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (!nextActivityId) {
        nextSearchParams.delete("activityId");
        const suffix = nextSearchParams.toString();
        router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
        return;
      }

      nextSearchParams.set("activityId", nextActivityId);
      const selectedActivity = data.activities.find((activity) => activity.id === nextActivityId) ?? null;
      const mappedOperationalId =
        selectedActivity?.objectRefType && selectedActivity.objectRefId
          ? operationalIdByObjectRef.get(`${selectedActivity.objectRefType}:${selectedActivity.objectRefId}`) ?? null
          : null;

      if (mappedOperationalId) {
        nextSearchParams.set("operationalId", mappedOperationalId);
      } else if (!selectedOperationalId) {
        nextSearchParams.delete("operationalId");
      }

      const suffix = nextSearchParams.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [data.activities, operationalIdByObjectRef, pathname, router, searchParams, selectedOperationalId]
  );

  return (
    <div className="scenario-editor-visuals">
      <LinearScheduleClient
        data={data}
        filters={{
          scenarioId,
          packageIds: [],
          workfront: null,
          activityType: null
        }}
        embedded
        initialSelectedActivityId={selectedActivityId}
        onSelectedActivityChange={handleSelectedActivityChange}
      />
    </div>
  );
}
