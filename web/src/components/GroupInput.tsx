import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { api } from '../lib/api'
import { inputClass } from './ui'

export function GroupInput({
  value,
  onChange,
  id = 'whatsapp-groups',
}: {
  value: string
  onChange: (value: string) => void
  id?: string
}): ReactNode {
  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.whatsapp.groups(),
    retry: 0,
  })

  return (
    <>
      <input
        id={id}
        list={id}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="120363000000000000@g.us"
        autoComplete="off"
        required
      />
      <datalist id={id}>
        {groups.data?.data.map((group) => (
          <option key={group.id} value={group.id}>
            {group.subject}
          </option>
        ))}
      </datalist>
    </>
  )
}
