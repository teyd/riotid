import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export const chartColors = {
  players: '#4ade80',
  renames: '#38bdf8',
  moves: '#fbbf24',
  anonymous: '#a78bfa',
  muted: '#27272a',
} as const

export const regionColors: Record<string, string> = {
  na: '#4ade80',
  eu: '#38bdf8',
  ap: '#fbbf24',
  kr: '#a78bfa',
}

export const chartTooltipStyle = {
  backgroundColor: '#000',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  fontFamily: 'Commit Mono, monospace',
  fontSize: 11,
  padding: '8px 10px',
} as const

export const chartAxisTick = {
  fill: '#71717a',
  fontSize: 10,
  fontFamily: 'Commit Mono, monospace',
} as const

export const Donut = ({
  data,
  centerValue,
  centerLabel,
}: {
  data: ReadonlyArray<{ name: string; value: number; color: string }>
  centerValue: string
  centerLabel: string
}) => (
  <div className="relative h-52">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={[...data]}
          dataKey="value"
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: '#a1a1aa' }} />
      </PieChart>
    </ResponsiveContainer>
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">
        {centerValue}
      </span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
        {centerLabel}
      </span>
    </div>
  </div>
)
