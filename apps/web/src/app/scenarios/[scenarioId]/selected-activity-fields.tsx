"use client";

import { useEffect, useMemo, useState } from "react";

import type { LinearScheduleData } from "../../../lib/linear-schedule";

type ActivityChoice = {
  packageId: string | null;
  activityName: string;
};

type Props = {
  initialPackageId: string | null;
  initialActivityName: string;
  activityChoices: ActivityChoice[];
  packages: LinearScheduleData["packages"];
};

function filteredActivityNames(activityChoices: ActivityChoice[], packageId: string | null) {
  return [
    ...new Set(
      activityChoices
        .filter((activityChoice) => activityChoice.packageId === packageId)
        .map((activityChoice) => activityChoice.activityName)
    )
  ];
}

export default function SelectedActivityFields({
  initialPackageId,
  initialActivityName,
  activityChoices,
  packages
}: Props) {
  const [packageId, setPackageId] = useState(initialPackageId ?? "");
  const [activityName, setActivityName] = useState(initialActivityName);

  const visibleActivityNames = useMemo(
    () => filteredActivityNames(activityChoices, packageId || null),
    [activityChoices, packageId]
  );

  useEffect(() => {
    setPackageId(initialPackageId ?? "");
    setActivityName(initialActivityName);
  }, [initialActivityName, initialPackageId]);

  useEffect(() => {
    if (visibleActivityNames.includes(activityName)) {
      return;
    }
    setActivityName(visibleActivityNames[0] ?? "");
  }, [activityName, visibleActivityNames]);

  return (
    <>
      <label>
        <span>Package</span>
        <select name="packageId" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
          <option value="">Unassigned</option>
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Activity name</span>
        <select name="activityName" value={activityName} onChange={(event) => setActivityName(event.target.value)}>
          {visibleActivityNames.map((activityOption) => (
            <option key={activityOption} value={activityOption}>
              {activityOption}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
