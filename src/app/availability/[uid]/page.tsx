"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AvailabilityCalendar from "@/components/calendar/AvailabilityCalendar";
import { getPublicProfile } from "@/lib/publicProfiles";

export default function PublicAvailabilityPage() {
  const params = useParams();
  const uid = typeof params?.uid === "string" ? params.uid : params?.uid?.[0] || "";
  const [profile, setProfile] = useState({ uid: "", name: "Исполнитель" });
  useEffect(() => {
    let active = true;
    if (uid) void getPublicProfile(uid).then(snapshot => {
      const data = snapshot.data();
      const name = typeof data.displayName === "string" && data.displayName.trim() ? data.displayName : typeof data.name === "string" && data.name.trim() ? data.name : "Исполнитель";
      if (active) setProfile({ uid, name });
    }).catch(() => { if (active) setProfile({ uid, name: "Исполнитель" }); });
    return () => { active = false; };
  }, [uid]);
  return <AvailabilityCalendar key={uid} ownerId={uid} editable={false} displayName={profile.uid === uid ? profile.name : "Исполнитель"} />;
}
