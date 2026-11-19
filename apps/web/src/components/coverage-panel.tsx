import { Donut, chartColors } from './charts.tsx'
import { Panel, StatRow } from './panel.tsx'

export const CoveragePanel = ({
  linked,
  unresolved,
  ratio,
  total,
}: {
  linked: number
  unresolved: number
  ratio: number
  total?: number | undefined
}) => (
  <Panel title="Identity coverage" description="Only exact match-graph fingerprints become links.">
    <div className="mt-4">
      <Donut
        data={[
          { name: 'linked', value: linked, color: chartColors.players },
          { name: 'unresolved', value: unresolved, color: chartColors.muted },
        ]}
        centerValue={`${(ratio * 100).toFixed(1)}%`}
        centerLabel="linked"
      />
    </div>
    <dl className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[11px]">
      {total === undefined ? (
        <StatRow label="linked rows" value={linked} />
      ) : (
        <StatRow label="observed rows" value={total} />
      )}
      <StatRow
        label={total === undefined ? 'unresolved rows' : 'unresolved'}
        value={unresolved}
        muted
      />
    </dl>
  </Panel>
)
