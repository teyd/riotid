import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

type JsonObject = { [key: string]: JsonValue }

const isObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const Scalar = ({ value }: { value: JsonValue }) => {
  if (typeof value === 'string') return <span className="text-emerald-300/90">"{value}"</span>
  if (typeof value === 'number') return <span className="text-zinc-100">{value}</span>
  if (typeof value === 'boolean') return <span className="text-sky-300">{String(value)}</span>
  if (value === null) return <span className="text-zinc-600">null</span>
  return <span className="text-zinc-500">{JSON.stringify(value)}</span>
}

const JsonKey = ({ name, explanation }: { name: string; explanation?: string | undefined }) => {
  if (!explanation) return <span className="text-zinc-300">{name}</span>

  return (
    <Tooltip>
      <TooltipTrigger className="rounded-sm border-b border-dotted border-zinc-700 bg-transparent p-0 font-mono text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400">
        {name}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="z-50 max-w-xs rounded-md border border-white/10 bg-panel px-3 py-2 text-left font-sans text-xs leading-5 text-zinc-300 shadow-xl"
      >
        {explanation}
      </TooltipContent>
    </Tooltip>
  )
}

const Entry = ({
  name,
  value,
  path,
  depth,
  comma,
  explanations,
}: {
  name: string
  value: JsonValue
  path: string
  depth: number
  comma: boolean
  explanations: Record<string, string>
}) => {
  const key = (
    <>
      <span className="text-zinc-600">"</span>
      <JsonKey name={name} explanation={explanations[path]} />
      <span className="text-zinc-600">"</span>
      <span className="text-zinc-600">: </span>
    </>
  )

  if (isObject(value)) {
    const entries = Object.entries(value)

    return (
      <>
        <div style={{ paddingLeft: depth * 18 }} className="leading-6 hover:bg-white/[0.02]">
          {key}
          <span className="text-zinc-600">{'{'}</span>
        </div>
        {entries.map(([childName, child], index) => (
          <Entry
            key={`${path}.${childName}`}
            name={childName}
            value={child}
            path={`${path}.${childName}`}
            depth={depth + 1}
            comma={index < entries.length - 1}
            explanations={explanations}
          />
        ))}
        <div style={{ paddingLeft: depth * 18 }} className="leading-6 text-zinc-600">
          {'}'}
          {comma ? ',' : ''}
        </div>
      </>
    )
  }

  return (
    <div style={{ paddingLeft: depth * 18 }} className="leading-6 hover:bg-white/[0.02]">
      {key}
      <Scalar value={value} />
      {comma ? <span className="text-zinc-600">,</span> : null}
    </div>
  )
}

export const JsonCode = ({
  value,
  explanations,
}: {
  value: JsonObject
  explanations: Record<string, string>
}) => {
  const entries = Object.entries(value)

  return (
    <div className="font-mono text-[12px] leading-6 text-zinc-300">
      <div className="text-zinc-600">{'{'}</div>
      {entries.map(([name, child], index) => (
        <Entry
          key={name}
          name={name}
          value={child}
          path={name}
          depth={1}
          comma={index < entries.length - 1}
          explanations={explanations}
        />
      ))}
      <div className="text-zinc-600">{'}'}</div>
    </div>
  )
}
