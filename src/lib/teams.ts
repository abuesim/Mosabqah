export const TEAM_OPTIONS = [
  { id: 'cyan', label: 'الفريق الأزرق', color: '#22d3ee' },
  { id: 'purple', label: 'الفريق البنفسجي', color: '#a855f7' },
  { id: 'green', label: 'الفريق الأخضر', color: '#4ade80' },
  { id: 'red', label: 'الفريق الأحمر', color: '#f87171' },
  { id: 'gold', label: 'الفريق الذهبي', color: '#fbbf24' },
  { id: 'pink', label: 'الفريق الوردي', color: '#e879f9' },
] as const;

export type TeamId = typeof TEAM_OPTIONS[number]['id'];

export function getTeam(teamId?: string) {
  return TEAM_OPTIONS.find((team) => team.id === teamId);
}

export function getTeamFromColor(color?: string) {
  return TEAM_OPTIONS.find((team) => team.color === color);
}
