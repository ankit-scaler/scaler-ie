"use client";

export type Job = {
  id: number;
  site: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  job_type: string | null;
  date_posted: string | null;
  job_url: string;
  search_role: string;
};

export default function JobsView({ initial }: { initial: Job[] }) {
  return <div>{initial.length} jobs loaded</div>;
}
