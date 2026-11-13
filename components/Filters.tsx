"use client";
import { useMemo } from "react";
import FilterBar, { Suggestion } from "./FilterBar";

// role and round are multi-select: an empty list means "All".
export type FilterState = {
  program: string; company: string; role: string[]; round: string[]; topic: string; q: string;
};

// Canonical spelling + display order for known programs; anything else found
// in the data (unexpected casing, a brand-new program) is appended after.
const CANONICAL_PROGRAMS = ["Academy", "DSML", "AIML", "DevOps"];

export const EMPTY_FILTERS: FilterState = { program: "All", company: "All", role: [], round: [], topic: "All", q: "" };

export const filtersActive = (s: FilterState) =>
  s.program !== "All" || s.company !== "All" || s.role.length > 0 || s.round.length > 0 || s.topic !== "All" || s.q.trim() !== "";

export default function Filters({
  data, state, setState, showRound = true, showTopic = false,
}: {
  data: { program?: string; company: string; role: string; round?: string | null; related_topic?: string | null }[];
  state: FilterState;
  setState: (s: FilterState) => void;
  showRound?: boolean;
  showTopic?: boolean;
}) {
  // Only show a program pill if this dataset actually has rows for it — e.g.
  // AIML shouldn't appear on Assignments if no assignment has that program.
  const programs = useMemo(() => {
    const present = Array.from(new Set(data.map(d => (d.program || "").trim()).filter(Boolean)));
    const known = CANONICAL_PROGRAMS.filter(c => present.some(p => p.toLowerCase() === c.toLowerCase()));
    const extra = present.filter(p => !CANONICAL_PROGRAMS.some(c => c.toLowerCase() === p.toLowerCase())).sort();
    return ["All", ...known, ...extra];
  }, [data]);

  const filteredForCompany = useMemo(
    () => (state.program === "All" ? data : data.filter(d => (d.program || "").toLowerCase() === state.program.toLowerCase())),
    [data, state.program]
  );
  const companies = useMemo(
    () => ["All", ...Array.from(new Set(filteredForCompany.map(d => d.company).filter(Boolean))).sort()],
    [filteredForCompany]
  );
  const roles = useMemo(() => {
    const scope = state.company === "All"
      ? filteredForCompany
      : filteredForCompany.filter(d => d.company === state.company);
    return ["All", ...Array.from(new Set(scope.map(d => d.role).filter(Boolean))).sort()];
  }, [filteredForCompany, state.company]);
  // Rounds available for a given role selection (empty = any role).
  const roundsFor = (roleSel: string[]) => {
    const scope = filteredForCompany.filter(d =>
      (state.company === "All" || d.company === state.company) &&
      (roleSel.length === 0 || roleSel.includes(d.role))
    );
    return ["All", ...Array.from(new Set(scope.map(d => d.round || "").filter(Boolean))).sort()];
  };
  const rounds = useMemo(
    () => roundsFor(state.role),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredForCompany, state.company, state.role]
  );
  // Changing roles keeps only the rounds that still exist under them.
  const setRoles = (role: string[]) => {
    const avail = new Set(roundsFor(role));
    setState({ ...state, role, round: state.round.filter(r => avail.has(r)) });
  };
  // Topic is a cross-cutting facet (any company/role can carry any topic),
  // so unlike rounds it's scoped only to the program pill, not company/role.
  const topics = useMemo(
    () => ["All", ...Array.from(new Set(filteredForCompany.map(d => d.related_topic || "").filter(Boolean))).sort()],
    [filteredForCompany]
  );
  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    filteredForCompany.forEach(d => {
      const t = d.related_topic || "";
      if (t) m.set(t, (m.get(t) || 0) + 1);
    });
    return m;
  }, [filteredForCompany]);

  const companyCounts = useMemo(() => {
    const m = new Map<string, number>();
    filteredForCompany.forEach(d => { if (d.company) m.set(d.company, (m.get(d.company) || 0) + 1); });
    return m;
  }, [filteredForCompany]);

  const opts = (list: string[], counts?: Map<string, number>) =>
    list.filter(o => o !== "All").map(o => ({ value: o, count: counts?.get(o) }));

  // Typing in the search box offers matching companies, roles and topics;
  // picking one sets that filter (and clears the typed text) rather than
  // doing a loose text match, so "amazon" lands on Amazon's questions, not
  // every question that mentions Amazon.
  const suggestions: Suggestion[] = useMemo(() => [
    ...companies.filter(c => c !== "All").map(c => ({
      group: "Companies", value: c, count: companyCounts.get(c),
      onPick: () => setState({ ...state, company: c, role: [], round: [], q: "" }),
    })),
    ...roles.filter(r => r !== "All").map(r => ({
      group: "Roles", value: r,
      // Picking a role from search adds it to the selection.
      onPick: () => {
        const role = state.role.includes(r) ? state.role : [...state.role, r];
        const avail = new Set(roundsFor(role));
        setState({ ...state, role, round: state.round.filter(x => avail.has(x)), q: "" });
      },
    })),
    ...(showTopic ? topics.filter(t => t !== "All").map(t => ({
      group: "Topics", value: t, count: topicCounts.get(t),
      onPick: () => setState({ ...state, topic: t, q: "" }),
    })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [companies, roles, topics, companyCounts, topicCounts, showTopic, state, setState]);

  return (
    <FilterBar
      search={state.q}
      onSearch={q => setState({ ...state, q })}
      placeholder={showTopic ? "Search a company, role, topic or keyword" : "Search a company or role"}
      suggestions={suggestions}
      segments={{
        value: state.program,
        options: programs.map(p => ({ value: p, label: p })),
        onChange: p => setState({ ...state, program: p, company: "All", role: [], round: [], topic: "All" }),
      }}
      facets={[
        { key: "company", label: "Company", value: state.company, options: opts(companies, companyCounts),
          onChange: v => setState({ ...state, company: v, role: [], round: [] }) },
        { key: "role", label: "Role", multi: true as const, values: state.role, options: opts(roles), onChange: setRoles },
        ...(showRound ? [{ key: "round", label: "Round", multi: true as const, values: state.round, options: opts(rounds),
          onChange: (v: string[]) => setState({ ...state, round: v }) }] : []),
        ...(showTopic ? [{ key: "topic", label: "Topic", value: state.topic, options: opts(topics, topicCounts),
          onChange: (v: string) => setState({ ...state, topic: v }) }] : []),
      ]}
      onClearAll={() => setState(EMPTY_FILTERS)}
    />
  );
}
