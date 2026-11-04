"use client";
import { useMemo, useEffect } from "react";
import Filters, { FilterState, EMPTY_FILTERS, filtersActive } from "./Filters";
import { EmptyState } from "./FilterBar";
import AssignmentCard from "./AssignmentCard";
import PacketBanner from "./PacketBanner";
import type { PacketLink } from "@/lib/prep-shared";
import { useUrlFilterState } from "@/lib/useUrlFilterState";

export type A = { id: number; program: string | null; company: string; role: string; round: string | null; link: string | null };

const DEFAULT_STATE: FilterState = { program: "All", company: "All", role: "All", round: "All", topic: "All", q: "" };

export default function AssignmentsView({ initial, packets = [] }: { initial: A[]; packets?: PacketLink[] }) {
  const [state, setState] = useUrlFilterState(DEFAULT_STATE);

  const filterData = useMemo(
    () => initial.map(x => ({ program: x.program || "", company: x.company, role: x.role })),
    [initial]
  );

  const filtered = useMemo(() => {
    const qL = state.q.trim().toLowerCase();
    return initial.filter(x =>
      (state.program === "All" || (x.program || "").toLowerCase() === state.program.toLowerCase()) &&
      (state.company === "All" || x.company.trim() === state.company.trim()) &&
      (state.role === "All"    || x.role.trim()    === state.role.trim()) &&
      (!qL || `${x.company} ${x.role}`.toLowerCase().includes(qL))
    );
  }, [initial, state]);

  useEffect(() => {
    if (state.company !== "All" && state.role !== "All") {
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: state.company, role: state.role,
          program: state.program === "All" ? null : state.program,
          path: "/assignments",
        }),
      }).catch(() => {});
    }
  }, [state.company, state.role, state.program]);

  return (
    <div className="space-y-8">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Take-home tasks</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Assignments,<br /><span className="text-mute">by company and role.</span>
        </h1>
      </section>

      <Filters data={filterData} state={state} setState={setState} showRound={false} />

      <section>
        <PacketBanner company={state.company} packets={packets} />
        <div className="mb-3 font-mono text-sm text-mute">
          {filtered.length.toLocaleString()} assignment{filtered.length === 1 ? "" : "s"}
        </div>
        {filtered.length === 0 ? (
          <EmptyState onClear={filtersActive(state) ? () => setState(EMPTY_FILTERS) : undefined} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a, i) => <AssignmentCard key={a.id} a={a} index={i} />)}
          </div>
        )}
      </section>
    </div>
  );
}
