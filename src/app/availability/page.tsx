"use client";
import { useAuth } from "@/components/AuthProvider";
import AvailabilityCalendar, { CalendarAccessState } from "@/components/calendar/AvailabilityCalendar";

export default function AvailabilityPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return <CalendarAccessState loading={loading} />;
  return <AvailabilityCalendar key={user.uid} ownerId={user.uid} editable />;
}
